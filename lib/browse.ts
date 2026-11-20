import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import { isMissingColumnError } from "@/lib/optionalColumns";
import { chunk, ID_BATCH_SIZE } from "@/lib/people";
import type { Moment } from "@/types";

// Versioned, like timeline_cache_v2_ / profile_cache_v1_. What lands here is
// JSON.parsed straight into BrowseMeta[] and handed to queryClient.setQueryData,
// so a shape change would feed stale-shaped objects to five screens with nothing
// to notice. Bump the suffix whenever BrowseMeta changes and add the old prefix
// to BROWSE_CACHE_PREFIXES_TO_CLEAR below. (Optional fields every reader treats
// as maybe-missing, like songGenre, songReleaseDate and timeOfDay, don't need a bump: an
// older copy just lacks them until the next fetch.)
const BROWSE_CACHE_PREFIX = "browse_meta_v2_"; // v2: mood → moods (multi-mood)

// When the cached copy was fetched (ms since epoch), in its own key so the
// cached shape stays as it was. Missing means "age unknown": treated as stale.
const BROWSE_CACHE_AT_PREFIX = "browse_meta_at_v1_";

// Every prefix this module has ever written, cleared together on sign-out and
// account deletion — bumping a version orphans the old key otherwise, leaving a
// full copy of the user's browse metadata on disk forever.
const BROWSE_CACHE_PREFIXES_TO_CLEAR = [
  BROWSE_CACHE_PREFIX,
  BROWSE_CACHE_AT_PREFIX,
  "browse_meta_v1_",
  "browse_meta_",
];

const browseCacheKey = (userId: string) => `${BROWSE_CACHE_PREFIX}${userId}`;
const browseCacheAtKey = (userId: string) => `${BROWSE_CACHE_AT_PREFIX}${userId}`;

// Cheap structural check, not validation: the version prefix protects against
// shapes we know changed, this catches a truncated or hand-edited payload. On
// mismatch we return null so the caller falls through to the network.
const BROWSE_META_KEYS: (keyof BrowseMeta)[] = [
  "id",
  "moods",
  "people",
  "momentDate",
  "songTitle",
  "songArtist",
  "songAlbumName",
  "songArtworkUrl",
];

function isBrowseMetaArray(value: unknown): value is BrowseMeta[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true; // a user with no moments caches []
  const first: unknown = value[0];
  if (typeof first !== "object" || first === null) return false;
  return BROWSE_META_KEYS.every((key) => key in first);
}

/** The cached metadata and when it was fetched (0 when unknown), or null. */
export async function readBrowseCacheEntry(
  userId: string
): Promise<{ data: BrowseMeta[]; fetchedAt: number } | null> {
  try {
    const [[, raw], [, at]] = await AsyncStorage.multiGet([browseCacheKey(userId), browseCacheAtKey(userId)]);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isBrowseMetaArray(parsed)) return null;
    const fetchedAt = Number(at);
    return { data: parsed, fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? fetchedAt : 0 };
  } catch {
    return null;
  }
}

export async function readBrowseCache(userId: string): Promise<BrowseMeta[] | null> {
  return (await readBrowseCacheEntry(userId))?.data ?? null;
}

/** Stamped with the time of the write: callers write right after a fetch. */
export async function writeBrowseCache(userId: string, data: BrowseMeta[]): Promise<void> {
  try {
    await AsyncStorage.setItem(browseCacheKey(userId), JSON.stringify(data));
    // After the data, so a write cut short leaves no timestamp (stale), never
    // a fresh timestamp on old data.
    await AsyncStorage.setItem(browseCacheAtKey(userId), String(Date.now()));
  } catch {}
}

/**
 * Marks the disk copy stale, so the next launch refetches it. Runs when the
 * in-memory entry is invalidated (see watchBrowseMetaInvalidation): with no
 * screen observing it nothing refetches, and a relaunch would otherwise trust
 * the old copy for BROWSE_META_STALE.
 */
export async function markBrowseCacheStale(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(browseCacheAtKey(userId));
  } catch {}
}

export async function clearBrowseCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove(BROWSE_CACHE_PREFIXES_TO_CLEAR.map((p) => `${p}${userId}`));
  } catch {}
}

export interface BrowseMeta {
  id: string;
  moods: string[];
  people: string[];
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  songAlbumName: string;
  songArtworkUrl: string;
  /** iTunes primary genre saved at capture; null/absent for older moments. */
  songGenre?: string | null;
  /** The song's release date ("YYYY-MM-DD"); null/absent when unknown. */
  songReleaseDate?: string | null;
  /** When it was written, as saved ("Morning" … "Late Night"); null/absent when unknown or cached before it was read. */
  timeOfDay?: string | null;
}

// time_of_day is a baseline column, so it's in the fallback list too.
const BROWSE_COLUMNS =
  "id, mood, moods, people, moment_date, song_title, song_artist, song_album_name, song_artwork_url, time_of_day";
// For Insights (genres, musical periods). Added by 20261120120000_song_metadata.sql;
// until that's applied the fetch falls back to BROWSE_COLUMNS.
const BROWSE_SONG_COLUMNS = "song_genre, song_release_date";

function fetchBrowseRows(userId: string, columns: string): Promise<any[]> {
  return fetchAllRows<any>((from, to) =>
    supabase
      .from("moments")
      .select(columns)
      .eq("user_id", userId)
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      // A unique tiebreak, so pages never overlap or skip a row.
      .order("id", { ascending: false })
      .range(from, to)
  );
}

/**
 * One row per moment for the whole library, paged past PostgREST's 1000-row
 * cap. Every fetch also refreshes the disk copy the next launch paints from,
 * whichever screen asked for it.
 */
export async function fetchBrowseMetadata(userId: string): Promise<BrowseMeta[]> {
  let rows: any[];
  try {
    rows = await fetchBrowseRows(userId, `${BROWSE_COLUMNS}, ${BROWSE_SONG_COLUMNS}`);
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    rows = await fetchBrowseRows(userId, BROWSE_COLUMNS);
  }
  const meta = rows.map((r: any): BrowseMeta => ({
    id: r.id,
    // Dual-read: single-mood rows from binaries <= build 22 wrap into an array.
    moods: r.moods ?? (r.mood ? [r.mood] : []),
    people: r.people ?? [],
    momentDate: r.moment_date ?? null,
    songTitle: r.song_title ?? "",
    songArtist: r.song_artist ?? "",
    songAlbumName: r.song_album_name ?? "",
    songArtworkUrl: r.song_artwork_url ?? "",
    songGenre: r.song_genre ?? null,
    songReleaseDate: r.song_release_date ?? null,
    timeOfDay: r.time_of_day ?? null,
  }));
  void persistIfSignedIn(userId, meta);
  return meta;
}

// Only while that user is still signed in: a fetch that lands after sign-out
// must not put their library back on disk once it was cleared.
async function persistIfSignedIn(userId: string, meta: BrowseMeta[]): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id === userId) await writeBrowseCache(userId, meta);
  } catch {}
}

/**
 * Launch warm-up for `["browseMeta", userId]`: paints the disk copy at once,
 * then refetches only when that copy is older than BROWSE_META_STALE (or its
 * age is unknown). Saves keep it fresh through invalidation, so a launch soon
 * after the last fetch no longer pulls the whole library again.
 */
export async function prefetchBrowseMeta(queryClient: QueryClient, userId: string): Promise<void> {
  watchBrowseMetaInvalidation(queryClient, userId);
  const cached = await readBrowseCacheEntry(userId);
  // A fetch that landed while the disk was being read is newer: keep it.
  if (cached && queryClient.getQueryData(["browseMeta", userId]) === undefined) {
    // Stamped with when it was fetched, not now, so the staleness check below
    // (and every screen's) judges its real age.
    queryClient.setQueryData(["browseMeta", userId], cached.data, { updatedAt: cached.fetchedAt });
  }
  await queryClient.prefetchQuery({
    queryKey: ["browseMeta", userId],
    queryFn: () => fetchBrowseMetadata(userId),
    staleTime: BROWSE_META_STALE,
  });
}

let watching: { queryClient: QueryClient; userId: string; stop: () => void } | null = null;

/**
 * Saves invalidate `["browseMeta", userId]` (lib/cacheInvalidation.ts). When
 * that happens, the disk copy is marked stale too, so a relaunch before any
 * screen refetched it doesn't paint the pre-save library as fresh. One watcher
 * at a time; calling again for the same user is a no-op.
 */
export function watchBrowseMetaInvalidation(queryClient: QueryClient, userId: string): void {
  if (watching && watching.queryClient === queryClient && watching.userId === userId) return;
  watching?.stop();
  const stop = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "invalidate") return;
    const [name, keyUserId] = event.query.queryKey;
    if (name === "browseMeta" && keyUserId === userId) void markBrowseCacheStale(userId);
  });
  watching = { queryClient, userId, stop };
}

/** Every row of a moment-card query, paged; `page` builds it for one range. */
async function fetchAllMoments(
  page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: unknown }>
): Promise<Moment[]> {
  return (await fetchAllRows<any>(page)).map(mapRowToMoment);
}

export async function fetchPersonMoments(userId: string, personName: string): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .contains("people", [personName])
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

/** Newest first, undated last, as the drill-down queries order them. */
export function compareLibraryOrder(
  a: { momentDate: string | null; createdAt: string; id: string },
  b: { momentDate: string | null; createdAt: string; id: string }
): number {
  if (a.momentDate !== b.momentDate) {
    if (!a.momentDate) return 1;
    if (!b.momentDate) return -1;
    return a.momentDate < b.momentDate ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * A person's moments when they're a friend with linked names (lib/people.ts
 * `groupPeopleByPerson` knows which moments): read by id, 100 a request,
 * then put in library order.
 */
export async function fetchMomentsByIds(userId: string, ids: readonly string[]): Promise<Moment[]> {
  const batches = chunk([...new Set(ids)], ID_BATCH_SIZE);
  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS)
        .eq("user_id", userId)
        .in("id", batch);
      if (error) throw error;
      return (data ?? []).map(mapRowToMoment);
    })
  );
  return results.flat().sort(compareLibraryOrder);
}

export async function fetchYearMoments(userId: string, year: number): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .gte("moment_date", `${year}-01-01`)
      .lte("moment_date", `${year}-12-31`)
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

export async function fetchMoodMoments(userId: string, mood: string): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      // Match either representation: moods array containment for rows written by
      // multi-mood clients, the legacy mood column for rows binaries <= build 22
      // wrote after the backfill. Mood values are [a-z0-9_] so the raw PostgREST
      // or-syntax needs no escaping.
      .or(`moods.cs.{${mood}},mood.eq.${mood}`)
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

export async function fetchSongMoments(userId: string, title: string, artist: string): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .eq("song_title", title)
      .eq("song_artist", artist)
      // Undated moments last, as everywhere else (Postgres puts NULLs first in DESC).
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

export async function fetchAlbumMoments(userId: string, album: string, artist: string): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .eq("song_album_name", album)
      .eq("song_artist", artist)
      // Undated moments last, as everywhere else (Postgres puts NULLs first in DESC).
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

export async function fetchArtistMoments(userId: string, artist: string): Promise<Moment[]> {
  return fetchAllMoments((from, to) =>
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .eq("song_artist", artist)
      // Undated moments last, as everywhere else (Postgres puts NULLs first in DESC).
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
  );
}

/** One PostgREST double-quoted value: inside quotes, \ escapes the next char. */
function postgrestQuoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The `.or()` filter for a free-text moment search. Pure, exported for tests.
 *
 * User text can't go into the filter raw: commas and parentheses are the
 * or-grammar's own delimiters, so a title like "Hello, Goodbye" made the
 * request fail. Each value is quoted, and LIKE wildcards in the text are
 * escaped so they match literally.
 */
export function momentSearchOrFilter(text: string): string {
  const literal = text.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const pattern = postgrestQuoted(`%${literal}%`);
  return ["song_title", "song_artist", "reflection_text"]
    .map((column) => `${column}.ilike.${pattern}`)
    .join(",");
}
