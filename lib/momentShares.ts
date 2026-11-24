import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { ensureFullMedia, ensureFullMediaForMe } from "@/lib/ensureFullMedia";
import { isMissingRpcError } from "@/lib/sharedMomentLink";
import { shapeForViewer } from "@/lib/momentView";
import { fetchProfilesByIds } from "@/lib/friends";
import { personLabel } from "@/lib/people";
import { Moment } from "@/types";

// Sharing v2 (docs/SOCIAL-ARCHITECTURE.md): a moment_shares row is the directed
// "send this moment to a person" grant. All reads/writes of that table live
// here. The recipient-side list ("Shared with me") renders through the same
// MomentCard as the timeline, so each share carries a Moment with the
// sender's display name in contributorName. The moments come from the shared
// view (get_shared_with_me): no place, people or share link token.

export interface SharedMoment {
  shareId: string;
  sharedAt: string;
  viewedAt: string | null;
  senderId: string;
  moment: Moment;
}

/**
 * Pure DB→TypeScript mapping for a moment_shares row with its moment under
 * `moments` (from get_shared_with_me, or the older table embed). With a
 * viewer id, the moment is shaped for that viewer (lib/momentView.ts), so a
 * row from a server without the shared view still hides what it should.
 */
export function mapShareRow(row: any, senderName: string | null, viewerId?: string): SharedMoment {
  const mapped = mapRowToMoment(row.moments);
  const moment = viewerId ? shapeForViewer(mapped, viewerId) : mapped;
  return {
    shareId: row.id,
    sharedAt: row.created_at,
    viewedAt: row.viewed_at ?? null,
    senderId: row.sender_id,
    moment: senderName ? { ...moment, contributorName: senderName } : moment,
  };
}

/**
 * Everything shared to this user, newest first, through the shared view. No
 * pagination: this is a directed inbox, not a feed; the server's 200-row
 * default outruns any realistic volume.
 */
export async function fetchSharedWithMe(userId: string): Promise<SharedMoment[]> {
  const { data, error } = await supabase.rpc("get_shared_with_me");
  if (!error) {
    return ((data ?? []) as any[])
      .filter((row) => row?.moments)
      .map((row) => mapShareRow(row, row.sender_name ?? null, userId));
  }
  if (!isMissingRpcError(error)) throw error;
  return fetchSharedWithMeFromTable(userId);
}

/** The read before the shared view, for a server without get_shared_with_me. */
async function fetchSharedWithMeFromTable(userId: string): Promise<SharedMoment[]> {
  const { data, error } = await supabase
    .from("moment_shares")
    .select(`id, sender_id, created_at, viewed_at, moments!inner(${MOMENT_CARD_COLUMNS})`)
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = data ?? [];
  const profiles = await fetchProfilesByIds(rows.map((r: any) => r.sender_id));
  return rows.map((row: any) =>
    mapShareRow(row, profiles.get(row.sender_id)?.display_name ?? null, userId)
  );
}

/**
 * Send a moment to a friend. Inserting the grant row is what shares the
 * moment; the push is best-effort on top (a failed push must not roll back or
 * misreport an already-created grant). Returns the grant row id so the share
 * sheet can show (and unsend) the chip without a refetch.
 */
export async function sendMomentShare(
  momentId: string,
  senderId: string,
  recipientId: string
): Promise<{ status: "sent"; shareId: string } | { status: "already_sent" }> {
  // Linked photos (1.4): the friend gets the originals, not thumbnails.
  await ensureFullMedia(momentId, senderId);
  const { data, error } = await supabase
    .from("moment_shares")
    .insert({ moment_id: momentId, sender_id: senderId, recipient_id: recipientId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { status: "already_sent" }; // UNIQUE (moment_id, recipient_id)
    throw error;
  }
  void supabase.functions
    .invoke("notify-social", {
      body: { type: "share_received", toUserId: recipientId, momentId },
    })
    .catch(() => {});
  return { status: "sent", shareId: data.id };
}

export interface MomentShareGrant {
  shareId: string;
  recipientId: string;
  name: string | null;
}

/**
 * Everyone this moment has been sent to, with display names — drives the
 * share sheet's "Shared with" chips and the person picker's sent-state.
 */
export async function fetchMomentShareRecipients(momentId: string): Promise<MomentShareGrant[]> {
  const { data, error } = await supabase
    .from("moment_shares")
    .select("id, recipient_id")
    .eq("moment_id", momentId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  // Throws when the names don't load: the sheet keeps its last chips rather
  // than showing everyone as "Someone".
  const profiles = await fetchProfilesByIds(rows.map((r: any) => r.recipient_id));
  return rows.map((r: any) => {
    const profile = profiles.get(r.recipient_id);
    return {
      shareId: r.id,
      recipientId: r.recipient_id,
      name: profile ? personLabel({ displayName: profile.display_name, username: profile.username }) : null,
    };
  });
}

/** How many of the latest sends the picker reads to order "recent" people. */
export const RECENT_SENDS_LIMIT = 200;

/**
 * When this user last sent a moment to each person, newest first: the person
 * pickers put recent recipients on top. Reads the latest sends only (the
 * `(sender_id)` index covers it); anyone older falls back to A–Z.
 */
export async function fetchRecentRecipients(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("moment_shares")
    .select("recipient_id, created_at")
    .eq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_SENDS_LIMIT);
  if (error) throw error;
  const lastSent = new Map<string, string>();
  for (const row of (data ?? []) as { recipient_id: string; created_at: string }[]) {
    if (!lastSent.has(row.recipient_id)) lastSent.set(row.recipient_id, row.created_at);
  }
  return lastSent;
}

/** Sender unsends (RLS also lets a recipient remove a share from their inbox). */
export async function removeMomentShare(shareId: string): Promise<void> {
  const { error } = await supabase.from("moment_shares").delete().eq("id", shareId);
  if (error) throw error;
}

/** Unread badge count for the "Shared with me" pill. */
export async function fetchUnviewedSharedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("moment_shares")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("viewed_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** The ids of the shares in a fetched list that haven't been seen yet. */
export function unviewedShareIds(items: Pick<SharedMoment, "shareId" | "viewedAt">[]): string[] {
  return items.filter((i) => !i.viewedAt).map((i) => i.shareId);
}

/**
 * Marks the given shares seen — called with the unseen shares the "Shared with
 * you" list is showing. Scoped to those ids so a share that arrives while the
 * list is open keeps its unread dot until it has actually been on screen.
 */
export async function markSharesViewed(userId: string, shareIds: string[]): Promise<void> {
  if (shareIds.length === 0) return;
  const { error } = await supabase
    .from("moment_shares")
    .update({ viewed_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .in("id", shareIds)
    .is("viewed_at", null);
  if (error) throw error;
}

// ─── Share links (/m/{token}) ─────────────────────────────────────────────────

/** The public link for a moment's share token. */
export function momentShareUrl(token: string): string {
  return `https://soundtracks.app/m/${token}`;
}

/** The public friend-invite link for a profile's friend_invite_token. */
export function friendInviteUrl(token: string): string {
  return `https://soundtracks.app/friend/${token}`;
}

/**
 * The moment's share token, creating one if it has none. Only the owner can
 * set it, and an update that matches no row returns no error, so the write
 * asks for the updated row back and treats an empty result as a failure:
 * otherwise a link that leads nowhere gets shared.
 *
 * The update only fills an empty token, so a stale `current` (card-shaped
 * moments don't carry the token) can never replace a link that's already live;
 * in that case the live token is read back and returned.
 */
export async function ensureShareToken(
  momentId: string,
  current: string | null | undefined
): Promise<string> {
  // Linked photos (1.4): the link's page shows the originals, so upload any
  // that are only linked, even when the link already exists (photos may have
  // been added since).
  await ensureFullMediaForMe(momentId);
  if (current) return current;
  const token = Crypto.randomUUID();
  const { data, error } = await supabase
    .from("moments")
    .update({ share_token: token })
    .eq("id", momentId)
    .is("share_token", null)
    .select("id");
  if (error) throw error;
  if ((data ?? []).length > 0) return token;

  // No row updated: either a token already exists, or this user can't set it.
  const { data: row, error: readError } = await supabase
    .from("moments")
    .select("share_token")
    .eq("id", momentId)
    .maybeSingle();
  if (readError) throw readError;
  if (row?.share_token) return row.share_token as string;
  throw new Error("permission denied: share link not created");
}

