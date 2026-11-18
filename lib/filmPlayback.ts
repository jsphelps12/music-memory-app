// Timing and loading decisions for the moment film (components/MomentFilm.tsx),
// kept pure so they can be tested. Tested in lib/__tests__/filmPlayback.test.ts.

/** How long a photo holds before the next fades in. */
export const PHOTO_MS = 4000;

/**
 * How long the film waits on the current video item before moving on by
 * itself, or null when the video's own end moves it on (or nothing should).
 *
 * A video that can't play here (not linked, someone else's, failed) holds
 * its poster like a photo. So does one that is still loading when it comes
 * up (a large iCloud original): its poster shows for PHOTO_MS and, if the
 * video still isn't ready, the film moves on rather than waiting on a
 * spinner. If it gets ready in time it plays through as usual. A single
 * item (looping) or a paused film never moves on by itself.
 */
export function videoHoldMs(state: {
  active: boolean;
  playing: boolean;
  loop: boolean;
  /** A linked video this phone can play and that hasn't failed. */
  usable: boolean;
  ready: boolean;
}): number | null {
  if (!state.active || !state.playing || state.loop) return null;
  if (state.usable && state.ready) return null;
  return PHOTO_MS;
}

/**
 * How item `i` loads its video from Photos, or null when it stays a poster.
 *
 * - "full": the item on screen, the original quality (iCloud streaming if
 *   need be).
 * - "light": the next item, loaded ahead so the fade into it is smooth, and
 *   the item it's fading out of (it keeps its last frame). The native view
 *   (modules/photos-video) takes a copy already on the phone if there is one,
 *   else Photos' lighter streaming version, and buffers only a few seconds,
 *   so a film never pulls several full iCloud originals at once.
 * - null: every other item (the one behind stays mounted as a poster).
 */
export type VideoLoad = "full" | "light" | null;

export function videoLoad(i: number, index: number, under: number | null, count: number): VideoLoad {
  if (i === index) return "full";
  if (i === under) return "light";
  return count > 1 && i === (index + 1) % count ? "light" : null;
}

/** Whether item `i` loads its video at all (see videoLoad). */
export function loadsVideo(i: number, index: number, under: number | null, count: number): boolean {
  return videoLoad(i, index, under, count) !== null;
}
