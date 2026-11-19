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
 * Whether item `i` should load its video from Photos. Each one is a full
 * quality (often iCloud) stream, so only the item on screen, the one it is
 * fading out of (it keeps its last frame), and the next one (loaded ahead so
 * the fade into it is smooth) do. The item behind stays mounted as a poster.
 */
export function loadsVideo(i: number, index: number, under: number | null, count: number): boolean {
  if (i === index || i === under) return true;
  return count > 1 && i === (index + 1) % count;
}
