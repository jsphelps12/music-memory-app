// Starts the first-page timeline fetch as soon as auth resolves — before the
// tab even mounts. fetchMoments() consumes the promise instead of firing a
// duplicate request, eliminating the initial load delay.
//
// Caching strategy (stale-while-revalidate):
//   1. On prefetch, immediately resolve from AsyncStorage if available → instant render.
//   2. Network fetch runs in parallel; on success, writes fresh data back to cache.
//   3. fetchMoments() consumes the promise (which may already be resolved from cache).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { lastTimelineMarkAt } from "@/lib/timelineRefresh";
import { Moment } from "@/types";

export const TIMELINE_PAGE_SIZE = 30;

/**
 * A prefetch older than this is not handed to the timeline. The prefetch only
 * exists to cover the gap between auth resolving and the Journal mounting,
 * normally a second or two.
 */
export const PREFETCH_MAX_AGE_MS = 30_000;

// Bump the version whenever the cached Moment shape changes. v1 predates the
// multi-mood change (`mood` -> `moods: string[]`); a v1 cache would hand the
// timeline objects without `moods` and crash MomentCard on first paint.
const CACHE_KEY_PREFIX = "timeline_cache_v2_";
const LEGACY_CACHE_KEY_PREFIXES = ["timeline_cache_v1_"];

type Pending = { promise: Promise<Moment[] | null>; userId: string; startedAt: number };

// null means "network failed with no cache" — distinct from [] which means "user has 0 moments"
let _prefetch: Pending | null = null;
// The network leg, tracked separately so it survives consumePrefetchPromise()
// and the timeline can still apply the authoritative result after rendering
// from cache.
let _network: Pending | null = null;
// Incremented by each prefetch, by dropping one unused, and by
// clearTimelineCache; an in-flight fetch whose generation is stale must not
// write to disk. See prefetchTimeline.
let _generation = 0;
// The user whose timeline is already on screen (it took the prefetch or
// wrote the cache). Auth events re-run hydration while the profile load is
// failing, and a prefetch fired then was never consumed by the mounted
// Journal; a later remount painted it over newer rows. Skip it instead.
let _loadedUserId: string | null = null;

/**
 * Whether a prefetch started at `startedAt` may still be painted: younger than
 * maxAgeMs and not older than the last local change to moments. Pure; tested.
 */
export function isPrefetchFresh(
  startedAt: number,
  now: number,
  lastMarkedAt: number,
  maxAgeMs = PREFETCH_MAX_AGE_MS
): boolean {
  return now - startedAt <= maxAgeMs && startedAt >= lastMarkedAt;
}

function isUsable(entry: Pending | null, userId: string, now: number): entry is Pending {
  return (
    entry?.userId === userId && isPrefetchFresh(entry.startedAt, now, lastTimelineMarkAt())
  );
}

function cacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

function isCachedMoment(value: unknown): value is Moment {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    Array.isArray(m.moods) &&
    Array.isArray(m.photoUrls) &&
    Array.isArray(m.photoThumbnails)
  );
}

/**
 * Shape check for the disk cache. The cache outlives app updates, so a bundle
 * must never trust what an older bundle wrote: one malformed row is enough to
 * throw during the first render, and offline the bad cache is never replaced.
 * Returns null (treated as a cache miss) unless every row has the fields the
 * card reads unguarded.
 */
export function parseCachedTimeline(raw: string | null): Moment[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.every(isCachedMoment) ? parsed : null;
  } catch {
    return null;
  }
}

async function readCache(userId: string): Promise<Moment[] | null> {
  try {
    return parseCachedTimeline(await AsyncStorage.getItem(cacheKey(userId)));
  } catch {
    return null;
  }
}

function removeLegacyCaches(userId: string): Promise<void> {
  return AsyncStorage.multiRemove(
    LEGACY_CACHE_KEY_PREFIXES.map((prefix) => `${prefix}${userId}`)
  ).catch(() => {});
}

async function writeCache(userId: string, moments: Moment[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(moments));
  } catch {}
}

export function prefetchTimeline(userId: string, now = Date.now()): void {
  // Already on screen: the Journal refreshes itself from here on.
  if (_loadedUserId === userId) return;
  // Already in flight for this user. An outdated one is replaced, not kept.
  if (isUsable(_prefetch, userId, now)) return;

  // Generation counter, checked before the cache write below. Clearing the cache
  // (on sign-out or account deletion) can't cancel a fetch that's already in
  // flight, and that fetch used to write its rows back to disk AFTER the clear —
  // putting the signed-out user's moments back on the device. Bumping the
  // generation makes any in-flight fetch recognise it has been superseded.
  const generation = ++_generation;

  // Old-format caches are never read again; drop them so they don't linger.
  void removeLegacyCaches(userId);

  // Fire network fetch immediately (runs in background)
  const networkFetch = Promise.resolve(
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .order("moment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(0, TIMELINE_PAGE_SIZE - 1)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(mapRowToMoment);
      })
      .then((moments) => {
        if (generation === _generation) writeCache(userId, moments);
        return moments;
      })
  ).catch((err: unknown) => {
    if (__DEV__) console.warn("[timelinePrefetch] network fetch failed:", err);
    return null; // signals "offline, no cache available" to fetchMoments
  });

  // Race: return cache immediately if available, else wait for network
  _prefetch = {
    userId,
    startedAt: now,
    promise: readCache(userId).then((cached) => {
      if (cached && cached.length > 0) {
        // Return cached data instantly; network fetch updates cache in background
        return cached;
      }
      return networkFetch;
    }),
  };
  // Tracked separately so it can be applied to the UI after a cache hit.
  // Without this, the first paint of every launch showed the server state as of
  // the *previous* launch — a moment created last session was simply missing,
  // and the 30s focus cooldown suppressed the refetch that would have corrected
  // it. A deterministic "doesn't load right the first time", even on fast wifi.
  _network = { userId, startedAt: now, promise: networkFetch };
}

/**
 * The prefetched first page, once. Null for another user's prefetch, and for
 * one that is too old or predates a local change (it is discarded, so it can't
 * be painted over newer rows later either).
 */
export function consumePrefetchPromise(userId: string, now = Date.now()): Promise<Moment[] | null> | null {
  if (_prefetch?.userId !== userId) return null; // wrong user — discard
  if (!isUsable(_prefetch, userId, now)) {
    discardTimelinePrefetch(userId);
    return null;
  }
  const p = _prefetch.promise;
  _prefetch = null;
  _loadedUserId = userId;
  return p;
}

/**
 * The in-flight network fetch behind the prefetch, if any.
 *
 * Call after consumePrefetchPromise resolved from cache: awaiting this gives the
 * authoritative first page so the UI can be corrected. Returns null when there
 * is nothing in flight for this user.
 */
export function consumePrefetchNetworkPromise(userId: string, now = Date.now()): Promise<Moment[] | null> | null {
  if (_network?.userId !== userId) return null;
  if (!isUsable(_network, userId, now)) {
    discardTimelinePrefetch(userId);
    return null;
  }
  const p = _network.promise;
  _network = null;
  return p;
}

/**
 * Drops the prefetch for this user without using it. Called when the timeline
 * knows the data changed after the prefetch fired (see planFocusFetch), so a
 * later consumer (e.g. the error-state retry) can't pick up the outdated
 * result either.
 */
export function discardTimelinePrefetch(userId: string): void {
  let dropped = false;
  if (_prefetch?.userId === userId) {
    _prefetch = null;
    dropped = true;
  }
  if (_network?.userId === userId) {
    _network = null;
    dropped = true;
  }
  // Its network leg may still be in flight; it must not write its outdated
  // page over what the timeline writes (writeTimelineCache).
  if (dropped) _generation++;
}

/** Pass to writeTimelineCache: capture it when a fetch starts. */
export function getTimelineCacheGeneration(): number {
  return _generation;
}

/**
 * Writes the timeline's first page to the disk cache, so the next launch paints
 * what the user last saw rather than the state as of the previous launch.
 * Call after a page-0 fetch or merge and after applying a local change.
 *
 * `generation` is getTimelineCacheGeneration() from when the data was fetched;
 * if the cache was cleared since (sign-out, account deletion) or a newer fetch
 * superseded it, nothing is written.
 */
export function writeTimelineCache(
  userId: string,
  moments: Moment[],
  generation = _generation
): void {
  if (generation !== _generation) return;
  _loadedUserId = userId;
  void writeCache(userId, moments.slice(0, TIMELINE_PAGE_SIZE));
}

// ── Merging a refreshed first page into a paginated list ──────────────────
// Pure, exported for tests. The timeline must not collapse to one page when it
// refreshes in the background: that dropped every page the user had scrolled
// through and threw them back near the top.

/**
 * Timeline order: moment_date descending with undated last, then created_at
 * descending (the same order as the query). Negative when `a` comes first.
 */
export function compareTimelineOrder(
  a: Pick<Moment, "momentDate" | "createdAt">,
  b: Pick<Moment, "momentDate" | "createdAt">
): number {
  if (a.momentDate !== b.momentDate) {
    if (!a.momentDate) return 1;
    if (!b.momentDate) return -1;
    return a.momentDate > b.momentDate ? -1 : 1;
  }
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt > b.createdAt ? -1 : 1;
}

/**
 * Applies a freshly fetched first page to the list on screen. The fresh page is
 * authoritative for its range. Already-loaded rows that sort after it are kept;
 * rows missing from it that would sort inside it were deleted (or moved) and go.
 */
export function mergeFirstPage(
  current: Moment[],
  fresh: Moment[],
  currentHasMore: boolean,
  pageSize = TIMELINE_PAGE_SIZE
): { moments: Moment[]; hasMore: boolean } {
  // A short first page is the whole timeline.
  if (fresh.length < pageSize) return { moments: fresh, hasMore: false };
  if (current.length <= pageSize) return { moments: fresh, hasMore: true };
  const last = fresh[fresh.length - 1];
  const freshIds = new Set(fresh.map((m) => m.id));
  const tail = current.filter(
    (m) => !freshIds.has(m.id) && compareTimelineOrder(m, last) >= 0
  );
  return { moments: [...fresh, ...tail], hasMore: tail.length > 0 ? currentHasMore : true };
}

/**
 * Places a moment saved or edited elsewhere into the list on screen: in its
 * timeline position (a backdated moment lands in its month), replacing any row
 * with the same id (the merge may already have it). When more pages exist and
 * it sorts past the last loaded row, it's left for load-more to bring in.
 */
export function insertPendingMoment(current: Moment[], moment: Moment, hasMore: boolean): Moment[] {
  const rest = current.filter((m) => m.id !== moment.id);
  const index = rest.findIndex((m) => compareTimelineOrder(moment, m) <= 0);
  if (index === -1) return hasMore ? rest : [...rest, moment];
  return [...rest.slice(0, index), moment, ...rest.slice(index)];
}

/** Appends a page, skipping ids already shown (offsets shift when rows are added). */
export function appendPage(current: Moment[], page: Moment[]): Moment[] {
  const seen = new Set(current.map((m) => m.id));
  return [...current, ...page.filter((m) => !seen.has(m.id))];
}

/**
 * The last page index fully covered by `loadedCount` rows. Rounds down, so the
 * next load-more may re-fetch a few rows (deduped by appendPage) but never
 * skips any.
 */
export function lastLoadedPage(loadedCount: number, pageSize = TIMELINE_PAGE_SIZE): number {
  return Math.max(0, Math.floor(loadedCount / pageSize) - 1);
}

export async function clearTimelineCache(userId: string): Promise<void> {
  if (_prefetch?.userId === userId) _prefetch = null;
  if (_network?.userId === userId) _network = null;
  if (_loadedUserId === userId) _loadedUserId = null;
  // Supersede any in-flight fetch so it can't write this user's rows back to
  // disk after we've removed them — the fetch can't be aborted, but it checks
  // this before writing. Sign-out mid-prefetch used to restore the cache.
  _generation++;
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
  await removeLegacyCaches(userId);
}
