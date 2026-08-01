import { supabase } from "@/lib/supabase";
import { Friendship } from "@/types";

export interface ProfileResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
  friendInviteToken?: string;
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

export async function acceptFriendInvite(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("accept-friend-invite", {
    body: { token },
  });
  // Check typed errors from response body first (edge fn may return 4xx with JSON body)
  if (data?.error === "self_request") throw new Error("self_request");
  if (data?.error === "not_found") throw new Error("not_found");
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Unknown error");
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}

export async function fetchProfileByFriendToken(token: string): Promise<ProfileResult | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username, friend_invite_token")
    .eq("friend_invite_token", token)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    username: data.username,
    friendInviteToken: data.friend_invite_token,
  };
}

export async function checkUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  if (!username.trim()) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username.trim())
    .neq("id", currentUserId)
    .limit(1)
    .maybeSingle();
  return !data;
}
