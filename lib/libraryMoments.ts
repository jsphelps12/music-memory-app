// Photos ↔ music prototype (1.4, ROADMAP "three moments a week"). Pairs a song
// from the user's Apple Music library with the photos taken around the day it
// was added: "You added Holocene June 3, 2019, the week of these 14 photos."
//
// The open question the prototype answers on a real library is whether
// `dateAdded` means anything: a library sync or an import stamps hundreds of
// songs with one day. Those days are detected and left out.
//
// Pure and tested (lib/__tests__/libraryMoments.test.ts); the screen is
// app/dev/library.tsx.

export interface LibrarySongLike {
  persistentId: string;
  title: string;
  artistName: string;
  /** Epoch ms. */
  dateAdded: number;
  playCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Photos from this many days either side of the day a song was added. */
export const PHOTO_WINDOW_DAYS = 3;

/** More songs than this added on one day reads as a sync or import, not a choice. */
export const BULK_DAY_THRESHOLD = 25;

/** Songs added more recently than this aren't memories yet. */
export const MIN_AGE_DAYS = 90;

/** Local calendar day key, "2019-06-03". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Days with more than `threshold` songs added, busiest first. */
export function bulkDays(
  songs: Pick<LibrarySongLike, "dateAdded">[],
  threshold: number = BULK_DAY_THRESHOLD
): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of songs) {
    const k = dayKey(s.dateAdded);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > threshold)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Songs worth checking for photos: not added on a bulk day, at least
 * MIN_AGE_DAYS old, most played first, at most `limit`.
 */
export function candidateSongs<T extends LibrarySongLike>(
  songs: T[],
  now: number,
  limit: number,
  bulk: Set<string> = new Set(bulkDays(songs).map((b) => b.day))
): T[] {
  const cutoff = now - MIN_AGE_DAYS * DAY_MS;
  return songs
    .filter((s) => s.dateAdded <= cutoff && !bulk.has(dayKey(s.dateAdded)))
    .sort((a, b) => b.playCount - a.playCount || b.dateAdded - a.dateAdded)
    .slice(0, limit);
}

/** The photo window around the day a song was added: [from, to) in epoch ms. */
export function photoWindow(dateAdded: number, days: number = PHOTO_WINDOW_DAYS): { from: number; to: number } {
  const d = new Date(dateAdded);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { from: startOfDay - days * DAY_MS, to: startOfDay + (days + 1) * DAY_MS };
}

/**
 * How strong a pairing is. Photos matter most (a week with 14 photos was a
 * week that happened); plays say the song stuck. Both taper so one huge
 * number can't carry a weak pairing.
 */
export function pairingScore(photoCount: number, playCount: number): number {
  if (photoCount === 0) return 0;
  return Math.log2(1 + photoCount) * 2 + Math.log2(1 + playCount);
}

/** "You added Holocene June 3, 2019, the week of these 14 photos." */
export function pairingLine(title: string, dateAdded: number, photoCount: number): string {
  const when = new Date(dateAdded).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const photos = photoCount === 1 ? "this photo" : `these ${photoCount} photos`;
  return `You added ${title} ${when}, the week of ${photos}.`;
}
