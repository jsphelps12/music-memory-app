// The past half of photos ↔ music (1.4, ROADMAP "three moments a week"): songs
// from the user's Apple Music library paired with the photos of the day or
// week they were added, for Rediscover.
// - On this day: songs added on today's date in past years.
// - From before: a few strong pairings a week, older than MIN_AGE_DAYS,
//   scored by how unusual the week was against the person's usual photo
//   volume (a trip beats an ordinary week) and by how much the song stuck.
// Pure and tested (lib/__tests__/pastPairings.test.ts); lib/pastPairingsData.ts
// reads the phone. Lessons from the prototype: album adds share one date
// (one row each), sync/import days carry no meaning (left out).

import { ALBUM_ADD_MIN, type LibraryTrack } from "@/lib/lastWeek";
import { bulkDays, dayKey, MIN_AGE_DAYS } from "@/lib/libraryMoments";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rediscover shows at most this many phone pairings on a day. */
export const ON_THIS_DAY_MAX = 3;
/** From before checks this many candidates for photos, then picks the best. */
export const FROM_BEFORE_CANDIDATES = 40;
export const FROM_BEFORE_PICKS = 3;
/** A From before week needs at least this many times the usual photos. */
export const SPIKE_MIN = 1.5;

export interface PastSong {
  key: string;
  storeId: string | null;
  title: string;
  artistName: string;
  albumTitle: string;
  /** Day key it was added. */
  day: string;
  /** When it was added, epoch ms. */
  at: number;
  plays: number;
  albumTracks?: number;
}

function toPast(t: LibraryTrack, albumTracks?: number): PastSong {
  return {
    key: t.storeId || `lib:${t.persistentId}`,
    storeId: t.storeId || null,
    title: t.title,
    artistName: t.artistName,
    albumTitle: t.albumTitle ?? "",
    day: dayKey(t.dateAdded),
    at: t.dateAdded,
    plays: t.playCount,
    albumTracks,
  };
}

/**
 * One row per add: three or more songs from one album added on one day are
 * that album, led by its most played track. Days that look like a sync or
 * import are dropped. Most played first.
 */
export function collapseAdds(tracks: LibraryTrack[], bulk: Set<string> = new Set(bulkDays(tracks).map((b) => b.day))): PastSong[] {
  const groups = new Map<string, LibraryTrack[]>();
  for (const t of tracks) {
    const day = dayKey(t.dateAdded);
    if (bulk.has(day)) continue;
    const album = t.albumId && t.albumId !== "0" ? t.albumId : `single:${t.persistentId}`;
    const k = `${day}|${album}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: PastSong[] = [];
  for (const g of groups.values()) {
    if (g.length >= ALBUM_ADD_MIN) {
      out.push(toPast(g.reduce((a, b) => (b.playCount > a.playCount ? b : a)), g.length));
    } else {
      for (const t of g) out.push(toPast(t));
    }
  }
  return out.sort((a, b) => b.plays - a.plays || b.at - a.at);
}

/** Songs added on this calendar day in an earlier year, most played first. */
export function onThisDaySongs(library: LibraryTrack[], now: number, max = ON_THIS_DAY_MAX): PastSong[] {
  const today = new Date(now);
  const bulk = new Set(bulkDays(library).map((b) => b.day));
  const matches = library.filter((t) => {
    const d = new Date(t.dateAdded);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear();
  });
  return collapseAdds(matches, bulk).slice(0, max);
}

/** "1 year ago", "3 years ago". */
export function yearsAgo(at: number, now: number): string {
  const n = new Date(now).getFullYear() - new Date(at).getFullYear();
  return n === 1 ? "1 year ago" : `${n} years ago`;
}

/**
 * From before's candidates: added at least MIN_AGE_DAYS ago, not on a bulk
 * day, not shown before or already saved; one per day (its most played),
 * most played first.
 */
export function fromBeforeCandidates(
  library: LibraryTrack[],
  now: number,
  exclude: Set<string>,
  limit = FROM_BEFORE_CANDIDATES
): PastSong[] {
  const cutoff = now - MIN_AGE_DAYS * DAY_MS;
  const bulk = new Set(bulkDays(library).map((b) => b.day));
  const old = library.filter((t) => t.dateAdded <= cutoff);
  const seenDays = new Set<string>();
  const out: PastSong[] = [];
  for (const s of collapseAdds(old, bulk)) {
    if (exclude.has(s.key) || seenDays.has(s.day)) continue;
    seenDays.add(s.day);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How strong a pairing is, against the person's usual week: photos relative
 * to the median week among the candidates (so someone who shoots constantly
 * still gets their trips, not every week), then plays. Both taper.
 */
export function relativeScore(photos: number, usualPhotos: number, plays: number): number {
  if (photos <= 0) return 0;
  const ratio = photos / Math.max(usualPhotos, 1);
  return Math.log2(1 + ratio) * 3 + Math.log2(1 + plays);
}

export interface ScoredPairing {
  song: PastSong;
  photos: number;
}

/**
 * The best `n` pairings, highest score first, one per month. Only weeks with
 * a real spike (SPIKE_MIN times the usual photos) count: an ordinary week
 * paired with a song reads as random. Fewer than `n` is fine.
 */
export function pickFromBefore(scored: ScoredPairing[], n = FROM_BEFORE_PICKS): ScoredPairing[] {
  const usual = median(scored.map((s) => s.photos));
  const ranked = scored
    .filter((s) => s.photos >= Math.max(1, usual * SPIKE_MIN))
    .map((s) => ({ ...s, score: relativeScore(s.photos, usual, s.song.plays) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const months = new Set<string>();
  const out: ScoredPairing[] = [];
  for (const r of ranked) {
    const month = r.song.day.slice(0, 7);
    if (months.has(month)) continue;
    months.add(month);
    out.push({ song: r.song, photos: r.photos });
    if (out.length >= n) break;
  }
  return out;
}

/** "Added June 3, 2019" for a From before row. */
export function addedOnLabel(at: number): string {
  return `Added ${new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

/** "played 89 times" (shown so a pick says why it was picked). */
export function playsLine(plays: number): string {
  if (plays <= 0) return "";
  return plays === 1 ? "played once" : `played ${plays} times`;
}

/** "the week of 14 photos", or "and 3 photos that day" for On this day. */
export function photosLine(count: number, span: "day" | "week"): string {
  if (count <= 0) return "";
  const photos = count === 1 ? "1 photo" : `${count} photos`;
  return span === "week" ? `the week of ${photos}` : `${photos} that day`;
}
