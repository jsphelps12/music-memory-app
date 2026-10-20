import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { Album, AlbumPreview, Moment } from "@/types";

// ─── Legacy AsyncStorage caches (removed) ────────────────────────────────────
// Two disk caches used to live here and both had become write-only:
//
//  * collections_cache_v1_*  — written by a launch prefetch, and its last reader
//    (the album-picker membership check) now fetches fresh instead. The launch
//    write was a wasted startup network request competing with the fetches the
//    first paint actually depends on.
//  * collection_moments_v1_* — never written by anything; only cleared.
//
// Both are cleaned up on sign-out below so upgrading users don't leave orphaned
// keys on disk. Don't reintroduce a cache without a reader.
const LEGACY_CACHE_PREFIXES = ["collections_cache_v1_", "collection_moments_v1_"];

export async function clearLegacyAlbumCaches(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove(LEGACY_CACHE_PREFIXES.map((p) => `${p}${userId}`));
  } catch {}
}

// ─── Rows and mapping ────────────────────────────────────────────────────────

/** The `collections` columns every Album is built from. */
const ALBUM_COLUMNS = "id, user_id, name, created_at, is_public, invite_code, cover_photo_url";

/** Covers live in the same public bucket as moment photos (lib/storage.ts). */
const COVER_BUCKET = "moment-photos";

/**
 * Rows fetched per album for its artwork mosaic. The mosaic shows 4 distinct
 * artworks; the headroom covers the same song added more than once.
 */
const ARTWORK_ROWS_PER_ALBUM = 12;
const ARTWORKS_PER_ALBUM = 4;

interface CollectionMomentRef {
  moment_id: string;
  added_at?: string;
}

export interface AlbumRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  is_public: boolean | null;
  invite_code: string | null;
  cover_photo_url: string | null;
  owner_last_viewed_at?: string | null;
  collection_moments?: CollectionMomentRef[] | null;
}

interface MemberRow {
  collection_id: string;
  joined_at: string;
  last_viewed_at?: string | null;
}

/**
 * The single collections row → Album mapping. Owned albums carry their
 * moment ids (the share sheet reads them to show which albums a moment is in);
 * joined albums carry the owner's name instead.
 */
export function mapAlbumRow(row: AlbumRow, role: "owner" | "member", ownerName?: string | null): Album {
  const refs = row.collection_moments ?? [];
  const album: Album = {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    momentCount: refs.length,
    isPublic: row.is_public ?? false,
    inviteCode: row.invite_code ?? undefined,
    role,
    coverPhotoUrl: row.cover_photo_url ?? undefined,
  };
  if (role === "owner") album.momentIds = refs.map((r) => r.moment_id);
  else album.ownerName = ownerName ?? undefined;
  return album;
}

/** Thrown when an album doesn't exist or the user can no longer open it. */
export class AlbumNotFoundError extends Error {
  constructor(message = "Album not found.") {
    super(message);
    this.name = "AlbumNotFoundError";
  }
}

/** Thrown when an invite points at an album that can't be joined (gone or no longer shared). */
export class AlbumUnavailableError extends Error {
  constructor(message = "This album is no longer accepting new members.") {
    super(message);
    this.name = "AlbumUnavailableError";
  }
}

/**
 * Owner display names, keyed by user id. Names are decoration on a card, so a
 * failed lookup degrades to no name rather than failing the whole screen.
 */
async function fetchOwnerNames(ownerIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ownerIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (error && __DEV__) console.warn("[albums] owner name lookup failed:", error.message);
  return new Map((data ?? []).map((p: any) => [p.id, p.display_name ?? null]));
}

// ─── Album lists ─────────────────────────────────────────────────────────────

export interface AlbumMember {
  userId: string;
  displayName: string | null;
  joinedAt: string;
}

/** Owned albums and membership rows: independent, so one parallel round trip. */
async function fetchOwnedAndMemberRows(userId: string): Promise<{ owned: AlbumRow[]; members: MemberRow[] }> {
  const [ownedRes, memberRes] = await Promise.all([
    supabase
      .from("collections")
      .select(`${ALBUM_COLUMNS}, owner_last_viewed_at, collection_moments(moment_id, added_at)`)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("collection_members")
      .select("collection_id, joined_at, last_viewed_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true }),
  ]);
  if (ownedRes.error) throw ownedRes.error;
  if (memberRes.error) throw memberRes.error;
  return { owned: (ownedRes.data ?? []) as AlbumRow[], members: (memberRes.data ?? []) as MemberRow[] };
}

/** Albums the user joined, with their owners' names (collections, then profiles). */
async function fetchJoinedRows(
  joinedIds: string[]
): Promise<{ joined: AlbumRow[]; ownerNames: Map<string, string | null> }> {
  if (joinedIds.length === 0) return { joined: [], ownerNames: new Map() };
  const { data, error } = await supabase
    .from("collections")
    .select(`${ALBUM_COLUMNS}, collection_moments(moment_id, added_at)`)
    .in("id", joinedIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const joined = (data ?? []) as AlbumRow[];
  const ownerNames = await fetchOwnerNames(joined.map((r) => r.user_id));
  return { joined, ownerNames };
}

function toAlbums(owned: AlbumRow[], joined: AlbumRow[], ownerNames: Map<string, string | null>): Album[] {
  const ownedIds = new Set(owned.map((r) => r.id));
  return [
    ...owned.map((row) => mapAlbumRow(row, "owner")),
    ...joined.filter((row) => !ownedIds.has(row.id)).map((row) => mapAlbumRow(row, "member", ownerNames.get(row.user_id))),
  ];
}

export async function fetchAlbums(userId: string): Promise<Album[]> {
  const { owned, members } = await fetchOwnedAndMemberRows(userId);
  const { joined, ownerNames } = await fetchJoinedRows(members.map((m) => m.collection_id));
  return toAlbums(owned, joined, ownerNames);
}

export interface AlbumsOverview {
  albums: Album[];
  /** Shared albums' new-moment counts since the user last opened them. */
  newCounts: Record<string, number>;
  /** Up to four song artworks per album (see fetchAlbumArtworks). */
  artworks: Record<string, string[]>;
}

/**
 * Everything the Albums screen (and the You tab's album row) shows, in two
 * round trips on the critical path: owned + membership rows, then the joined
 * albums (and their owners' names) alongside the artworks.
 */
export async function fetchAlbumsOverview(userId: string): Promise<AlbumsOverview> {
  const { owned, members } = await fetchOwnedAndMemberRows(userId);
  const joinedIds = members.map((m) => m.collection_id);
  // A joined album's cover isn't known yet, so ask for all of them; the
  // per-album limit keeps that cheap.
  const artworkIds = [...owned.filter((r) => !r.cover_photo_url).map((r) => r.id), ...joinedIds];
  const [{ joined, ownerNames }, artworks] = await Promise.all([
    fetchJoinedRows(joinedIds),
    fetchAlbumArtworks(artworkIds),
  ]);
  const activity = buildAlbumActivity(owned, joined, members, ownerNames);
  return {
    albums: toAlbums(owned, joined, ownerNames),
    newCounts: Object.fromEntries(activity.map((a) => [a.collectionId, a.newMomentCount])),
    artworks,
  };
}

/**
 * The You tab's album row: albums with something new first, then the most
 * recently made, cut to `limit`. Derived from the overview so both screens can
 * share one query.
 */
export function selectAlbumsPreview(overview: AlbumsOverview, limit: number) {
  const { albums, newCounts, artworks } = overview;
  const preview = [...albums]
    .sort(
      (a, b) =>
        (newCounts[b.id] ?? 0) - (newCounts[a.id] ?? 0) ||
        b.createdAt.localeCompare(a.createdAt)
    )
    .slice(0, limit);
  return { total: albums.length, preview, artworks, newCounts };
}

export async function createAlbum(userId: string, name: string, isShared = false): Promise<Album> {
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name, is_public: isShared })
    .select(ALBUM_COLUMNS)
    .single();

  if (error) throw error;
  return mapAlbumRow(data as AlbumRow, "owner");
}

export async function convertAlbumToShared(id: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ is_public: true })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Shared albums need a guest user before wedding guests can contribute. The
 * edge function is idempotent (it returns the existing one), so this is safe
 * to retry. `functions.invoke` doesn't throw on a non-2xx status; it returns
 * the error, so check it.
 */
export async function ensureAlbumGuestUser(collectionId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("create-guest-user", {
    body: { collectionId },
  });
  if (error) throw error;
}

/** Whether an owned shared album still lacks its guest user (a failed or skipped setup). */
export async function albumNeedsGuestUser(collectionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("collections")
    .select("guest_user_id")
    .eq("id", collectionId)
    .maybeSingle();
  if (error) throw error;
  return !!data && !data.guest_user_id;
}

/** Best-effort removal of a cover image from the public bucket. */
async function removeCoverObject(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(COVER_BUCKET).remove([path]);
  if (error && __DEV__) console.warn("[albums] failed to delete cover:", error.message);
}

/**
 * Delete an album and its cover image. The bucket is public, so the image has
 * to go with the row (CLAUDE.md). The cover is removed only once the row
 * delete has succeeded.
 *
 * An album with a guest user also holds guest contributions, which only the
 * server can clean up (rows and photos). That runs first, and a failure stops
 * the delete so it can be retried; deleting the album first would leave them
 * behind with nothing pointing at them.
 */
export async function deleteAlbum(id: string): Promise<void> {
  const { data: album, error: lookupError } = await supabase
    .from("collections")
    .select("guest_user_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (album?.guest_user_id) {
    const { error: cleanupError } = await supabase.functions.invoke("delete-guest-moments", {
      body: { collectionId: id },
    });
    if (cleanupError) throw cleanupError;
  }

  const { data, error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .select("cover_photo_url");
  if (error) throw error;
  await Promise.all((data ?? []).map((row: any) => removeCoverObject(row.cover_photo_url)));
}

export async function addMomentToAlbum(
  collectionId: string,
  momentId: string,
  addedByUserId: string
): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .insert({ collection_id: collectionId, moment_id: momentId, added_by_user_id: addedByUserId });
  if (error) throw error;
}

export async function removeMomentFromAlbum(collectionId: string, momentId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .delete()
    .eq("collection_id", collectionId)
    .eq("moment_id", momentId);
  if (error) throw error;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

/**
 * A lightweight preview of a shared album for the join screen. Returns null
 * only when no shared album has this code; any other failure (offline, a
 * timeout) throws so the screen can offer a retry instead of calling a working
 * link dead.
 */
export async function fetchAlbumByInviteCode(inviteCode: string): Promise<AlbumPreview | null> {
  const { data: album, error } = await supabase
    .from("collections")
    .select("id, user_id, name, is_public, invite_code, collection_moments(moment_id)")
    .eq("invite_code", inviteCode)
    .eq("is_public", true)
    .maybeSingle();

  if (error) throw error;
  if (!album) return null;

  const ownerNames = await fetchOwnerNames([album.user_id]);

  return {
    id: album.id,
    name: album.name,
    ownerId: album.user_id,
    ownerName: ownerNames.get(album.user_id) ?? null,
    momentCount: (album.collection_moments ?? []).length,
    isPublic: album.is_public,
    inviteCode: album.invite_code,
  };
}

/** Postgres error codes the join insert can fail with. */
const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";

/**
 * Add the current user to a shared album and return it. Only shared albums can
 * be joined; if the album stopped being shared after the preview loaded, the
 * insert is refused and this throws AlbumUnavailableError. Joining an album
 * you're already in is treated as success.
 */
export async function joinAlbum(inviteCode: string, userId: string): Promise<Album> {
  const preview = await fetchAlbumByInviteCode(inviteCode);
  if (!preview) throw new AlbumUnavailableError();

  const { error } = await supabase
    .from("collection_members")
    .insert({ collection_id: preview.id, user_id: userId });

  if (error) {
    if (error.code === RLS_VIOLATION) throw new AlbumUnavailableError();
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }

  return {
    id: preview.id,
    userId: preview.ownerId,
    name: preview.name,
    createdAt: new Date().toISOString(),
    momentCount: preview.momentCount,
    isPublic: preview.isPublic,
    inviteCode: preview.inviteCode,
    role: "member",
    ownerName: preview.ownerName ?? undefined,
  };
}

// Remove the current user from a shared album
export async function leaveAlbum(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Fetch all members of an album (owner use only)
export async function fetchAlbumMembers(collectionId: string): Promise<AlbumMember[]> {
  const { data, error } = await supabase
    .from("collection_members")
    .select("user_id, joined_at")
    .eq("collection_id", collectionId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const names = await fetchOwnerNames(data.map((r: any) => r.user_id));

  return data.map((r: any) => ({
    userId: r.user_id,
    displayName: names.get(r.user_id) ?? null,
    joinedAt: r.joined_at,
  }));
}

// Remove a specific member from an album (owner use only)
export async function removeAlbumMember(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Shared-album activity ───────────────────────────────────────────────────

export interface SharedAlbumActivity {
  collectionId: string;
  name: string;
  role: 'owner' | 'member';
  ownerName?: string;
  inviteCode?: string;
  totalMoments: number;
  newMomentCount: number;
  latestAddedAt: string | null;
  coverPhotoUrl?: string;
}

function activityFor(
  row: AlbumRow,
  role: "owner" | "member",
  lastViewed: string | null,
  ownerName?: string | null
): SharedAlbumActivity {
  const moments = row.collection_moments ?? [];
  const newCount = lastViewed
    ? moments.filter((m) => (m.added_at ?? "") > lastViewed).length
    : moments.length;
  const latest = moments.reduce<string | null>(
    (max, m) => (m.added_at && (!max || m.added_at > max) ? m.added_at : max),
    null
  );
  return {
    collectionId: row.id,
    name: row.name,
    role,
    ...(role === "member" ? { ownerName: ownerName ?? undefined } : {}),
    inviteCode: row.invite_code ?? undefined,
    totalMoments: moments.length,
    newMomentCount: newCount,
    latestAddedAt: latest,
    coverPhotoUrl: row.cover_photo_url ?? undefined,
  };
}

/**
 * Shared albums the user is in, with new-moment counts since their last visit.
 * "New" = added_at > last_viewed_at (members) or > owner_last_viewed_at
 * (owners), falling back to joined_at / created_at when never viewed. Owned
 * albums count only while shared: nobody else can add to a personal one.
 * Sorted by most recent addition; joined albums with nothing in them are left
 * out, and an album that's both owned and joined counts once, as owned.
 */
export function buildAlbumActivity(
  owned: AlbumRow[],
  joined: AlbumRow[],
  members: MemberRow[],
  ownerNames: Map<string, string | null>
): SharedAlbumActivity[] {
  const memberMap = new Map(members.map((r) => [r.collection_id, r]));
  const ownedActivity = owned
    .filter((row) => row.is_public)
    .map((row) => activityFor(row, "owner", row.owner_last_viewed_at ?? row.created_at ?? null));
  const joinedActivity = joined.map((row) => {
    const membership = memberMap.get(row.id);
    return activityFor(
      row,
      "member",
      membership?.last_viewed_at ?? membership?.joined_at ?? null,
      ownerNames.get(row.user_id)
    );
  });

  const seen = new Set<string>();
  return [...ownedActivity, ...joinedActivity]
    .filter((c) => {
      if (seen.has(c.collectionId)) return false;
      seen.add(c.collectionId);
      return c.role === 'owner' || c.totalMoments > 0;
    })
    .sort((a, b) => {
      if (!a.latestAddedAt) return 1;
      if (!b.latestAddedAt) return -1;
      return b.latestAddedAt.localeCompare(a.latestAddedAt);
    });
}

export async function fetchSharedAlbumActivity(userId: string): Promise<SharedAlbumActivity[]> {
  const { owned, members } = await fetchOwnedAndMemberRows(userId);
  const { joined, ownerNames } = await fetchJoinedRows(members.map((m) => m.collection_id));
  return buildAlbumActivity(owned, joined, members, ownerNames);
}

// Mark a shared album as viewed now — clears its new-moment badge.
export async function markAlbumViewed(
  collectionId: string,
  userId: string,
  role: 'owner' | 'member'
): Promise<void> {
  const now = new Date().toISOString();
  if (role === 'owner') {
    const { error } = await supabase
      .from("collections")
      .update({ owner_last_viewed_at: now })
      .eq("id", collectionId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("collection_members")
      .update({ last_viewed_at: now })
      .eq("collection_id", collectionId)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

// ─── Album detail ────────────────────────────────────────────────────────────

// Fetch all moments across all contributors in a shared album via a single
// server-side join (get_shared_collection_moments RPC), avoiding 3 serial queries.
export async function fetchSharedAlbumMoments(collectionId: string): Promise<Moment[]> {
  const { data, error } = await supabase.rpc("get_shared_collection_moments", {
    p_collection_id: collectionId,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const moment = mapRowToMoment(row);
    moment.contributorName = row.contributor_name ?? null;
    return moment;
  });
}

/** Newest first; undated moments last, then by when they were written. */
export function compareAlbumMoments(a: Moment, b: Moment): number {
  if (a.momentDate !== b.momentDate) {
    if (!a.momentDate) return 1;
    if (!b.momentDate) return -1;
    return b.momentDate.localeCompare(a.momentDate);
  }
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

/**
 * A personal album's moments, read through its collection_moments rows so the
 * request doesn't grow with the album (an `.in("id", …)` list would).
 */
async function fetchPersonalAlbumMoments(collectionId: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("collection_moments")
    .select(`moments(${MOMENT_CARD_COLUMNS})`)
    .eq("collection_id", collectionId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.moments)
    .filter(Boolean)
    .map(mapRowToMoment)
    .sort(compareAlbumMoments);
}

export interface AlbumDetail {
  album: Album;
  moments: Moment[];
}

/**
 * One album and its moments for the detail screen, in two round trips: the
 * album row and the user's membership together, then the moments and (for a
 * joined album) the owner's name together. Throws AlbumNotFoundError only when
 * the album is gone or the user isn't its owner or a member; anything else
 * (offline, a timeout) throws the original error so the screen can retry.
 */
export async function fetchAlbumDetail(id: string, userId: string): Promise<AlbumDetail> {
  const [albumRes, memberRes] = await Promise.all([
    supabase.from("collections").select(ALBUM_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("collection_members")
      .select("collection_id")
      .eq("collection_id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (albumRes.error) throw albumRes.error;
  if (memberRes.error) throw memberRes.error;

  const row = albumRes.data as AlbumRow | null;
  if (!row) throw new AlbumNotFoundError();
  const role = row.user_id === userId ? "owner" : memberRes.data ? "member" : null;
  // Shared albums are readable by anyone with the id; this screen is for
  // their owner and members.
  if (!role) throw new AlbumNotFoundError();

  const [moments, ownerNames] = await Promise.all([
    row.is_public ? fetchSharedAlbumMoments(id) : fetchPersonalAlbumMoments(id),
    role === "member" ? fetchOwnerNames([row.user_id]) : Promise.resolve(new Map<string, string | null>()),
  ]);

  const album = mapAlbumRow(row, role, ownerNames.get(row.user_id));
  album.momentCount = moments.length;
  if (role === "owner") album.momentIds = moments.map((m) => m.id);
  return { album, moments };
}

// ─── Covers ──────────────────────────────────────────────────────────────────

/**
 * The id to hand uploadAlbumCover for a new cover. A fresh name per upload
 * means a changed cover gets a new URL; reusing one path kept serving the old
 * image from the image and CDN caches.
 */
export function albumCoverKey(collectionId: string, now: number = Date.now()): string {
  return `${collectionId}-${now.toString(36)}`;
}

/**
 * Point an album at a new cover (or none) and delete the object it replaces.
 * The old object goes only after the row update succeeds, so a failed update
 * never leaves the album pointing at a deleted image.
 */
export async function updateAlbumCover(
  collectionId: string,
  path: string | null,
  previousPath?: string | null
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ cover_photo_url: path })
    .eq("id", collectionId);
  if (error) throw error;
  if (previousPath && previousPath !== path) await removeCoverObject(previousPath);
}

export async function renameAlbum(collectionId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", collectionId);
  if (error) throw error;
}

/**
 * Up to four distinct song artworks per album, most recently added first: the
 * album's face when it has no cover photo (Phase 1, replacing the gradient
 * placeholder). Members can read these rows through the collection RLS.
 *
 * The embedded rows are limited per album on the server, so a large shared
 * album costs the same as a small one.
 */
export async function fetchAlbumArtworks(albumIds: string[]): Promise<Record<string, string[]>> {
  if (albumIds.length === 0) return {};
  const { data, error } = await supabase
    .from("collections")
    .select("id, collection_moments(added_at, moments(song_artwork_url))")
    .in("id", albumIds)
    .order("added_at", { referencedTable: "collection_moments", ascending: false })
    .limit(ARTWORK_ROWS_PER_ALBUM, { referencedTable: "collection_moments" });
  if (error) throw error;
  return pickAlbumArtworks((data ?? []) as any[]);
}

/** Up to four distinct artwork URLs per album, keeping the rows' order. */
export function pickAlbumArtworks(
  rows: { id: string; collection_moments?: { moments?: { song_artwork_url?: string | null } | null }[] | null }[]
): Record<string, string[]> {
  const byAlbum: Record<string, string[]> = {};
  for (const row of rows) {
    const list: string[] = [];
    for (const cm of row.collection_moments ?? []) {
      const url = cm.moments?.song_artwork_url;
      if (!url || list.includes(url)) continue;
      list.push(url);
      if (list.length === ARTWORKS_PER_ALBUM) break;
    }
    if (list.length > 0) byAlbum[row.id] = list;
  }
  return byAlbum;
}
