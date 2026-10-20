import { supabase } from "@/lib/supabase";
import { Friendship } from "@/types";

export interface ProfileResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
}

// Social Architecture v2: friendships are mutual-by-link only. A pair exists
// because someone opened the other's invite link (accept-friend-invite edge fn
// writes status "accepted" directly). There is no request/accept ceremony —
// the pending/sent machinery was deleted in Phase B.
function mapFriendshipRow(row: any, currentUserId: string): Friendship {
  const isRequester = row.requester_id === currentUserId;
  const otherUserId = isRequester ? row.addressee_id : row.requester_id;
  const profile = row.other_profile ?? null;
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    otherUserId,
    otherUserDisplayName: profile?.display_name ?? null,
    otherUserAvatarUrl: profile?.avatar_url ?? null,
    otherUserUsername: profile?.username ?? null,
  };
}

async function enrichFriendships(rows: any[], currentUserId: string): Promise<Friendship[]> {
  if (!rows || rows.length === 0) return [];
  const otherIds = rows.map((r) =>
    r.requester_id === currentUserId ? r.addressee_id : r.requester_id
  );
  const uniqueIds = [...new Set(otherIds)];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username")
    .in("id", uniqueIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((row) => {
    const otherId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
    return mapFriendshipRow({ ...row, other_profile: profileMap.get(otherId) ?? null }, currentUserId);
  });
}

export async function fetchFriends(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted")
    .limit(500);
  if (error) throw error;
  return enrichFriendships(data ?? [], userId);
}

/** The typed failures accept-friend-invite reports in its JSON body. */
export type FriendInviteErrorCode = "self_request" | "not_found";

export function friendInviteErrorCode(body: unknown): FriendInviteErrorCode | null {
  const code = (body as { error?: unknown } | null)?.error;
  return code === "self_request" || code === "not_found" ? code : null;
}

/**
 * On a non-2xx response functions-js returns `data: null` and puts the
 * Response on `error.context`, so the typed body has to be read from there.
 */
async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}

/** Throws Error("self_request" | "not_found") for those cases, else the original error. */
export async function acceptFriendInvite(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("accept-friend-invite", {
    body: { token },
  });
  if (!error && !data?.error) return;
  const code = friendInviteErrorCode(data) ?? (error ? friendInviteErrorCode(await readFunctionErrorBody(error)) : null);
  if (code) throw new Error(code);
  throw error ?? new Error(String(data?.error ?? "Unknown error"));
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}

/**
 * The owner of a friend invite link, or null when no profile has that token.
 * Throws on a failed request, so callers can tell "invalid link" from
 * "couldn't check".
 */
export async function fetchProfileByFriendToken(token: string): Promise<ProfileResult | null> {
  const { data, error } = await supabase.rpc("get_profile_by_invite_token", { p_token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; display_name: string | null; avatar_url: string | null; username: string | null }
    | null
    | undefined;
  if (!row?.id) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    username: row.username,
  };
}

/** Status of the friendship row between two users, or null when there is none. */
export async function fetchFriendshipStatus(
  userId: string,
  otherUserId: string
): Promise<Friendship["status"] | null> {
  const { data, error } = await supabase
    .from("friendships")
    .select("id, status")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`
    )
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as Friendship["status"] | undefined) ?? null;
}

/**
 * Only an accepted row means connected. A legacy pending or declined row is
 * upgraded by accept-friend-invite, so the link must still offer Connect.
 */
export function isConnected(status: Friendship["status"] | null): boolean {
  return status === "accepted";
}

/** Escape LIKE/ILIKE wildcards so the text matches literally. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Throws on a failed request rather than reporting the name as free. */
export async function checkUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  const cleaned = username.trim();
  if (!cleaned) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", escapeLikePattern(cleaned))
    .neq("id", currentUserId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !data;
}
