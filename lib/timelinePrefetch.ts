// Starts the first-page timeline fetch as soon as auth resolves — before the
// tab even mounts. fetchMoments() consumes the promise instead of firing a
// duplicate request, eliminating the initial load delay.

import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Moment } from "@/types";

export const TIMELINE_PAGE_SIZE = 30;

let _promise: Promise<Moment[]> | null = null;

export function prefetchTimeline(userId: string): void {
  if (_promise) return; // already in flight
  _promise = Promise.resolve(
    supabase
      .from("moments")
      .select("*")
      .eq("user_id", userId)
      .order("moment_date", { ascending: false, nullsFirst: false })
      .range(0, TIMELINE_PAGE_SIZE - 1)
  ).then(({ data }) => (data ?? []).map(mapRowToMoment));
}

export function consumePrefetchPromise(): Promise<Moment[]> | null {
  const p = _promise;
  _promise = null;
  return p;
}
