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
import { Moment } from "@/types";

export const TIMELINE_PAGE_SIZE = 30;

const CACHE_KEY_PREFIX = "timeline_cache_v1_";

// null means "network failed with no cache" — distinct from [] which means "user has 0 moments"
let _prefetch: { promise: Promise<Moment[] | null>; userId: string } | null = null;
// The network leg, tracked separately so it survives consumePrefetchPromise()
// and the timeline can still apply the authoritative result after rendering
// from cache.
let _network: { promise: Promise<Moment[] | null>; userId: string } | null = null;

function cacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

async function readCache(userId: string): Promise<Moment[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Moment[];
  } catch {
    return null;
  }
}

async function writeCache(userId: string, moments: Moment[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(moments));
  } catch {}
}

export function prefetchTimeline(userId: string): void {
  if (_prefetch?.userId === userId) return; // already in flight for this user

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
        writeCache(userId, moments);
        return moments;
      })
  ).catch((err: unknown) => {
    if (__DEV__) console.warn("[timelinePrefetch] network fetch failed:", err);
    return null; // signals "offline, no cache available" to fetchMoments
  });

  // Race: return cache immediately if available, else wait for network
  _prefetch = {
    userId,
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
  _network = { userId, promise: networkFetch };
}

export function consumePrefetchPromise(userId: string): Promise<Moment[] | null> | null {
  if (_prefetch?.userId !== userId) return null; // wrong user — discard
  const p = _prefetch.promise;
  _prefetch = null;
  return p;
}

/**
 * The in-flight network fetch behind the prefetch, if any.
 *
 * Call after consumePrefetchPromise resolved from cache: awaiting this gives the
 * authoritative first page so the UI can be corrected. Returns null when there
 * is nothing in flight for this user.
 */
export function consumePrefetchNetworkPromise(userId: string): Promise<Moment[] | null> | null {
  if (_network?.userId !== userId) return null;
  const p = _network.promise;
  _network = null;
  return p;
}

export async function clearTimelineCache(userId: string): Promise<void> {
  if (_prefetch?.userId === userId) _prefetch = null;
  if (_network?.userId === userId) _network = null;
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
}
