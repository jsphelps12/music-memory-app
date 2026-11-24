/**
 * The part of the song (Josh, 2026-11-23): one point in the song where the
 * moment lives ("the bridge at 2:41"), stored as `moments.song_part_ms`.
 * Full playback starts there; a 30 s preview can't, so for it the part is
 * only a label. No looping and no range, by decision. Pure: tested in
 * lib/__tests__/songPart.test.ts.
 */

/** Below this a part means nothing: playback already starts at the top. */
export const MIN_PART_MS = 1000;
/** The column's own limit (moments_song_part_ms_check). */
const MAX_PART_MS = 7_200_000;

/** A time in a song as people say it: "2:41", "0:07", "1:02:03". */
export function formatSongTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * A part as it should be stored: whole seconds (people pick a second, and
 * "2:41" should mean 2:41.000), inside the song when its length is known,
 * and null when it's too close to the start to mean anything.
 */
export function normalizePartMs(ms: number | null | undefined, durationMs?: number | null): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  let value = Math.round(ms / 1000) * 1000;
  if (durationMs && durationMs > 0) value = Math.min(value, Math.max(0, Math.floor(durationMs / 1000) * 1000 - 1000));
  value = Math.min(value, MAX_PART_MS - 1000);
  return value >= MIN_PART_MS ? value : null;
}

/** Where full playback should start, in seconds, or undefined to start at the top. */
export function partStartSeconds(partMs: number | null | undefined): number | undefined {
  return partMs != null && partMs >= MIN_PART_MS ? partMs / 1000 : undefined;
}

/** "at 2:41", or null with no part. */
export function partLabel(partMs: number | null | undefined): string | null {
  return partMs != null && partMs >= MIN_PART_MS ? `at ${formatSongTime(partMs)}` : null;
}

/** The part's place along the song, 0 to 1, for a mark on a progress bar; null when unknown. */
export function partFraction(partMs: number | null | undefined, durationMs: number | null | undefined): number | null {
  if (partMs == null || partMs < MIN_PART_MS || !durationMs || durationMs <= 0) return null;
  return Math.min(1, partMs / durationMs);
}
