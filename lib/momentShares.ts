import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { Moment } from "@/types";

// Sharing v2 (docs/SOCIAL-ARCHITECTURE.md): a moment_shares row is the directed
// "send this moment to a person" grant. All reads/writes of that table live
// here. The recipient-side list ("Shared with me") renders through the same
// MomentCard as the timeline, so each share carries a full card-shaped Moment
// with the sender's display name in contributorName.

export interface SharedMoment {
  shareId: string;
  sharedAt: string;
  viewedAt: string | null;
  senderId: string;
  moment: Moment;
}

/**
 * Pure DB→TypeScript mapping for a moment_shares row with its embedded moment.
 * The embedded row is card-column-shaped, so the mapped Moment fabricates the
 * same defaults the timeline cards do (see momentShares.test.ts).
 */
export function mapShareRow(row: any, senderName: string | null): SharedMoment {
  const moment = mapRowToMoment(row.moments);
  return {
    shareId: row.id,
    sharedAt: row.created_at,
    viewedAt: row.viewed_at ?? null,
    senderId: row.sender_id,
    moment: senderName ? { ...moment, contributorName: senderName } : moment,
  };
}

/**
 * Everything shared to this user, newest first. No pagination: this is a
 * directed inbox, not a feed — a 200-row cap outruns any realistic volume.
 */
export async function fetchSharedWithMe(userId: string): Promise<SharedMoment[]> {
  const { data, error } = await supabase
    .from("moment_shares")
    .select(`id, sender_id, created_at, viewed_at, moments!inner(${MOMENT_CARD_COLUMNS})`)
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = data ?? [];
  const senderIds = [...new Set(rows.map((r: any) => r.sender_id))];
  let nameById = new Map<string, string | null>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);
    nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
  }

  return rows.map((row: any) => mapShareRow(row, nameById.get(row.sender_id) ?? null));
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
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", [...new Set(rows.map((r: any) => r.recipient_id))]);
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
  return rows.map((r: any) => ({
    shareId: r.id,
    recipientId: r.recipient_id,
    name: nameById.get(r.recipient_id) ?? null,
  }));
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

/** Clears the unread badge — called when the "Shared with me" list is opened. */
export async function markSharesViewed(userId: string): Promise<void> {
  const { error } = await supabase
    .from("moment_shares")
    .update({ viewed_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("viewed_at", null);
  if (error) throw error;
}

