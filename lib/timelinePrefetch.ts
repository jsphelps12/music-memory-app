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
import { Moment } from "@/types";

export const TIMELINE_PAGE_SIZE = 30;

const CACHE_KEY_PREFIX = "timeline_cache_v1_";

let _promise: Promise<Moment[]> | null = null;

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
  if (_promise) return; // already in flight

  // Fire network fetch immediately (runs in background)
  const networkFetch = supabase
    .from("moments")
    .select("*")
    .eq("user_id", userId)
    .order("moment_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, TIMELINE_PAGE_SIZE - 1)
    .then(({ data }) => (data ?? []).map(mapRowToMoment))
    .then((moments) => {
      writeCache(userId, moments);
      return moments;
    })
    .catch((err) => {
      if (__DEV__) console.warn("[timelinePrefetch] network fetch failed:", err);
      return [] as typeof err;
    });

  // Race: return cache immediately if available, else wait for network
  _promise = readCache(userId).then((cached) => {
    if (cached && cached.length > 0) {
      // Return cached data instantly; network fetch updates cache in background
      return cached;
    }
    return networkFetch;
  });
}

export function consumePrefetchPromise(): Promise<Moment[]> | null {
  const p = _promise;
  _promise = null;
  return p;
}

export async function clearTimelineCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
}
