/**
 * Album invites from the friend picker (album basics, 2026-11-20): the pure
 * half. The database calls are in lib/albums.ts; the server side is
 * supabase/migrations/20261121010000_album_invites.sql (table
 * `collection_friend_invites`, RPCs `invite_to_album` and
 * `respond_to_album_invite`) and notify-social's album_invite push.
 *
 * Until that migration is applied, every call degrades to today's behaviour:
 * no invites in Albums → Shared, no "Invite friends" in the share sheet.
 */

/** One pending invite, as Albums → Shared shows it. */
export interface AlbumInvite {
  collectionId: string;
  albumName: string;
  coverPhotoUrl?: string;
  fromUserId: string;
  fromName: string | null;
  createdAt: string;
}

/** A pending invite row with its album embedded (collections RLS: shared albums are readable). */
export interface PendingInviteRow {
  collection_id: string;
  from_user: string;
  created_at: string;
  collections?: {
    id?: string;
    name?: string | null;
    cover_photo_url?: string | null;
    is_public?: boolean | null;
  } | null;
}

/**
 * The errors that mean the invite table or RPCs aren't on this server yet:
 * an undefined table (42P01), PostgREST not knowing the table (PGRST205) or
 * the function (PGRST202), or an undefined function (42883).
 */
const MISSING_BACKEND_CODES = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);

export function isMissingInviteBackend(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && MISSING_BACKEND_CODES.has(error.code);
}

/**
 * Pending invites worth showing, newest first: the album is still there and
 * shared, and the user isn't already in it (joined by link meanwhile, or
 * owns it). One per album.
 */
export function mapPendingInvites(
  rows: readonly PendingInviteRow[],
  excludeAlbumIds: ReadonlySet<string>,
  senderNames: ReadonlyMap<string, string | null>
): AlbumInvite[] {
  const seen = new Set<string>();
  const invites: AlbumInvite[] = [];
  for (const row of rows) {
    const album = row.collections;
    if (!album || album.is_public !== true) continue;
    if (excludeAlbumIds.has(row.collection_id) || seen.has(row.collection_id)) continue;
    seen.add(row.collection_id);
    invites.push({
      collectionId: row.collection_id,
      albumName: album.name ?? "",
      coverPhotoUrl: album.cover_photo_url ?? undefined,
      fromUserId: row.from_user,
      fromName: senderNames.get(row.from_user) ?? null,
      createdAt: row.created_at,
    });
  }
  return invites.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** How many invites Albums → Shared would show (the tab and pane dots). */
export function pendingInviteCount(
  rows: readonly PendingInviteRow[],
  excludeAlbumIds: ReadonlySet<string>
): number {
  return mapPendingInvites(rows, excludeAlbumIds, new Map()).length;
}

/** The invite row's second line. */
export function inviteFromLine(fromName: string | null | undefined): string {
  const name = fromName?.trim();
  return name ? `From ${name}` : "From a friend";
}

export type RespondStatus = "joined" | "declined" | "no_invite" | "unavailable";

/** Why Join didn't join (DESIGN.md: warm and plain, not "Invalid invite"). */
export function inviteClosedMessage(status: RespondStatus): string {
  return status === "unavailable"
    ? "This album isn't taking new members anymore."
    : "This invite isn't open anymore.";
}

/** respond_to_album_invite's answer; anything unexpected reads as a used-up invite. */
export function parseRespondStatus(data: unknown): RespondStatus {
  return data === "joined" || data === "declined" || data === "unavailable" ? data : "no_invite";
}

/**
 * A friend's row in the share sheet's "Invite friends" picker:
 * available (an Invite pill), inviting (a spinner), or invited (pending or
 * answered Not now: the owner sees "Invited" either way, never the answer).
 */
export type InviteRowState = "available" | "inviting" | "invited";

export function inviteRowState(
  personId: string,
  invitedIds: ReadonlySet<string>,
  invitingIds: ReadonlySet<string>
): InviteRowState {
  if (invitingIds.has(personId)) return "inviting";
  if (invitedIds.has(personId)) return "invited";
  return "available";
}

/** Friends the owner could invite: not the owner, not already a member. Order kept. */
export function inviteCandidates<T extends { id: string }>(
  friends: readonly T[],
  ownerId: string | undefined,
  memberIds: ReadonlySet<string>
): T[] {
  return friends.filter((f) => f.id !== ownerId && !memberIds.has(f.id));
}
