// How a moment's song and its video clips share the sound (1.4). The song is
// the soundtrack: clips play muted. Turning a clip's sound on brings it to
// CLIP_LEVEL and ducks the song to DUCK_LEVEL over DUCK_MS; turning it off (or
// leaving the clip) brings the song back over RESTORE_MS. A 30-second preview
// is ducked exactly; full Apple Music playback runs in Apple's player, which
// apps can't turn down, so iOS ducks it at its own level ("duck others",
// modules/photos-video). Playback only: a mix is never rendered to a file
// (PRODUCT.md, licensing). Tested in
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

/**
 * What the film turned down for a clip's sound, put back exactly once. Each
 * duck records its own undo when it happens (a preview fade, or asking iOS to
 * duck others); `restore()` runs them all and forgets them, so every way out
 * of a clip (sound off, next item, close, swipe away, unmount, the app going
 * to the background, a clip that fails) can call it without restoring twice
 * or restoring something that was never ducked.
 */
export interface MixRestore {
  /** Remember how to undo a duck that just happened. */
  hold(undo: () => void): void;
  /** Undo every held duck, newest first. True if there was anything to undo. */
  restore(): boolean;
  readonly held: boolean;
}

export function createMixRestore(): MixRestore {
  let undos: (() => void)[] = [];
  return {
    hold(undo) {
      undos.push(undo);
    },
    restore() {
      if (undos.length === 0) return false;
      const run = undos;
      undos = [];
      for (let i = run.length - 1; i >= 0; i--) {
        try {
          run[i]();
        } catch {
          // One failed undo mustn't keep the others from running.
        }
      }
      return true;
    },
    get held() {
      return undos.length > 0;
    },
  };
}
