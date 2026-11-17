// How a moment's song and its video clips share the sound (1.4). The song is
// the soundtrack: clips play muted. Turning a clip's sound on ducks the song
// to DUCK_LEVEL over DUCK_MS; turning it off (or leaving the clip) brings the
// song back over RESTORE_MS. A 30-second preview is ducked exactly; full
// Apple Music playback runs in Apple's player, which can't be turned down,
// so it pauses instead and resumes after. Playback only: a mix is never
// rendered to a file (PRODUCT.md, licensing). Tested in
// lib/__tests__/audioMix.test.ts.

/** The song under a clip's own sound: ~ -14 dB. */
export const DUCK_LEVEL = 0.2;
/** The clip's own sound when it's on: 80%, over the song at 20% (Josh, 2026-11-17). */
export const CLIP_LEVEL = 0.8;
export const DUCK_MS = 300;
export const RESTORE_MS = 800;

/** Volume `elapsedMs` into a fade from `from` to `to` over `durationMs`, eased out. */
export function fadeVolume(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  const t = elapsedMs / durationMs;
  const eased = 1 - (1 - t) * (1 - t);
  return from + (to - from) * eased;
}
