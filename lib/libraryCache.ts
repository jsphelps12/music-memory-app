// The Apple Music library, read once and shared (1.4). Last week, phone On
// this day, From before (picks, years, browsing) and the weekly play-count
// snapshot all need the same list of up to 8000 songs, and reading it is a
// full native fetch and sort. One copy is kept in memory: callers asking at
// the same time share one read, later callers get the copy until it's an
// hour old, and coming back to the app after a long time away drops it (the
// library changes rarely; play counts do as you listen).
//
// The list is shared: callers must not sort or change it in place.

import { AppState, type AppStateStatus } from "react-native";
import { getLibrarySongs, libraryAccessStatus } from "@/modules/now-playing";
import type { LibraryTrack } from "@/lib/lastWeek";

/** Enough of the library to cover what the features look at, most recently added first. */
export const LIBRARY_LIMIT = 8000;
/** How long a read stays good while the app is in use. */
export const LIBRARY_TTL_MS = 60 * 60 * 1000;
/** Away at least this long and the next read starts fresh. */
export const LIBRARY_RESUME_GAP_MS = 15 * 60 * 1000;

export interface SharedLoader<T> {
  /**
   * The cached value when it's younger than the TTL (and read no earlier
   * than `freshSince`), else the read in progress, else a new read.
   */
  get(options?: { freshSince?: number }): Promise<T>;
  /** Forget the value and any read in progress. */
  invalidate(): void;
}

/**
 * A value that's expensive to read: one read at a time, kept for `ttlMs`.
 * A failed read isn't kept, and neither is a value `keep` rejects. Pure
 * apart from `load`; tested.
 */
export function createSharedLoader<T>(
  load: () => Promise<T>,
  { ttlMs, now = Date.now, keep = () => true }: { ttlMs: number; now?: () => number; keep?: (value: T) => boolean }
): SharedLoader<T> {
  let entry: { value: T; at: number } | null = null;
  let inflight: { promise: Promise<T>; startedAt: number } | null = null;
  let generation = 0;

  return {
    get({ freshSince = -Infinity } = {}) {
      const t = now();
      if (entry && t - entry.at < ttlMs && entry.at >= freshSince) return Promise.resolve(entry.value);
      if (inflight && inflight.startedAt >= freshSince) return inflight.promise;
      const gen = generation;
      const startedAt = t;
      // A read reflects the library as of when it started, so that's its age.
      const promise = load()
        .then((value) => {
          // An older read finishing late never replaces a newer one.
          if (gen === generation && keep(value) && (!entry || entry.at <= startedAt)) entry = { value, at: startedAt };
          return value;
        })
        .finally(() => {
          if (inflight?.promise === promise) inflight = null;
        });
      inflight = { promise, startedAt };
      return promise;
    },
    invalidate() {
      entry = null;
      inflight = null;
      generation++;
    },
  };
}

/** Whether coming back to the app should drop the cached library. Pure; tested. */
export function dropOnResume(backgroundAt: number | null, now: number, gapMs = LIBRARY_RESUME_GAP_MS): boolean {
  return backgroundAt !== null && now - backgroundAt >= gapMs;
}

const loader = createSharedLoader<LibraryTrack[]>(
  async () => (await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[],
  // An empty read is cheap to repeat, and right after access is granted it
  // shouldn't stick for an hour.
  { ttlMs: LIBRARY_TTL_MS, keep: (songs) => songs.length > 0 }
);

/**
 * The library songs, most recently added first; [] without library access.
 * `freshSince` (epoch ms) asks for a read made no earlier than that, for
 * the weekly play-count snapshot.
 */
export async function getLibrary(options?: { freshSince?: number }): Promise<LibraryTrack[]> {
  if (libraryAccessStatus() !== "authorized") {
    loader.invalidate();
    return [];
  }
  return loader.get(options);
}

/** Drop the cached library (signing out, or access changed). */
export function clearLibraryCache(): void {
  loader.invalidate();
}

let wired = false;

/**
 * Call once at startup. Idempotent. Drops the cached library when the app
 * comes back after LIBRARY_RESUME_GAP_MS or more in the background.
 * "inactive" (Control Center, a Face ID prompt) isn't time away.
 */
export function wireLibraryCache(): void {
  if (wired) return;
  wired = true;
  let backgroundAt: number | null = null;
  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background") {
      backgroundAt ??= Date.now();
    } else if (state === "active") {
      if (dropOnResume(backgroundAt, Date.now())) loader.invalidate();
      backgroundAt = null;
    }
  });
}
