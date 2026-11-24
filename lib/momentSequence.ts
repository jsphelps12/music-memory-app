import type { MomentCardData } from "@/types";

// The list a moment was opened from, so left and right on the moment flip to
// the previous and next one in that list, like turning a journal's pages.
// Consume-once like momentCache and cardTransition: the list screen sets it
// on a card tap, the moment screen takes it on mount. Openers that don't set
// one (browse, search, Rediscover, notifications, links) open a single moment
// that doesn't flip.

export interface MomentSequence {
  /** In the order the list shows them. */
  ids: string[];
  /** The list's card data by position, shown while each full row loads. */
  moments?: (MomentCardData | null)[];
  /** Where the opened moment sits in `ids`. */
  index: number;
}

/**
 * A sequence older than this when the moment screen mounts was left by a tap
 * whose navigation never happened. The tap-to-mount gap is well under a
 * second; this only has to outlast a slow device.
 */
export const SEQUENCE_TTL_MS = 5000;

let pending: { sequence: MomentSequence; at: number } | null = null;

/** A list's sequence, opened at `openedId`. Null when there's nothing to flip to. */
export function sequenceFromList(
  list: readonly MomentCardData[],
  openedId: string
): MomentSequence | null {
  const index = list.findIndex((m) => m.id === openedId);
  if (index < 0 || list.length < 2) return null;
  return { ids: list.map((m) => m.id), moments: [...list], index };
}

/** Set by the list on a card tap; null clears a leftover one. */
export function setMomentSequence(sequence: MomentSequence | null, now = Date.now()): void {
  pending = sequence ? { sequence, at: now } : null;
}

/**
 * Takes the sequence for the moment being opened, and clears the slot either
 * way. Only one that was set moments ago for this very moment counts: a stale
 * one would flip through a list the moment wasn't opened from.
 */
export function consumeMomentSequence(openedId: string, now = Date.now()): MomentSequence | null {
  const snap = pending;
  pending = null;
  if (!snap || now - snap.at > SEQUENCE_TTL_MS) return null;
  const { sequence } = snap;
  if (sequence.ids.length < 2 || sequence.ids[sequence.index] !== openedId) return null;
  return sequence;
}

/** The position one step along (1 next, -1 previous), or null at either end: no wrap. */
export function stepIndex(sequence: MomentSequence, index: number, dir: 1 | -1): number | null {
  const next = index + dir;
  return next >= 0 && next < sequence.ids.length ? next : null;
}

/** The list's card data at a position, if the opener handed it over. */
export function momentAt(sequence: MomentSequence, index: number): MomentCardData | null {
  return sequence.moments?.[index] ?? null;
}

// ── Gesture math (worklets: they run in the moment screen's pan handlers) ──

/** A flip commits past this share of the screen's width... */
export const FLIP_DISTANCE_RATIO = 0.25;
/** ...or on a flick this fast (pt/s) that has moved at least FLIP_MIN_DISTANCE. */
export const FLIP_VELOCITY = 500;
export const FLIP_MIN_DISTANCE = 24;
/** Thrown back this fast against the drag, a far drag still cancels. */
export const FLIP_RETURN_VELOCITY = 300;

/**
 * Which way a released horizontal drag flips: 1 next (the finger went left,
 * the next page comes in from the right), -1 previous, 0 settle back. Never
 * toward an end with nothing there.
 */
export function flipDirection(
  translationX: number,
  velocityX: number,
  width: number,
  canPrev: boolean,
  canNext: boolean
): -1 | 0 | 1 {
  "worklet";
  if (translationX === 0) return 0;
  const dir = translationX < 0 ? 1 : -1;
  if (dir === 1 ? !canNext : !canPrev) return 0;
  const distance = Math.abs(translationX);
  // Speed in the direction of the drag; negative when thrown back.
  const along = dir === 1 ? -velocityX : velocityX;
  if (distance > width * FLIP_DISTANCE_RATIO) return along > -FLIP_RETURN_VELOCITY ? dir : 0;
  if (distance >= FLIP_MIN_DISTANCE && along > FLIP_VELOCITY) return dir;
  return 0;
}

/** Swipe down to close: past this far (pt)... */
export const CLOSE_DISTANCE = 140;
/** ...or a flick down this fast (pt/s) that has moved at least CLOSE_MIN_DISTANCE. */
export const CLOSE_VELOCITY = 900;
export const CLOSE_MIN_DISTANCE = 24;

/** Whether a released downward drag closes the moment. */
export function shouldClose(translationY: number, velocityY: number): boolean {
  "worklet";
  if (translationY > CLOSE_DISTANCE) return velocityY > -FLIP_RETURN_VELOCITY;
  return translationY >= CLOSE_MIN_DISTANCE && velocityY > CLOSE_VELOCITY;
}

/**
 * iOS's rubber band: past an end the page follows the finger less and less,
 * never more than `dimension`. 100pt of drag on a 390pt screen moves ~48pt.
 */
export function rubberBand(offset: number, dimension: number, coefficient = 0.55): number {
  "worklet";
  if (offset === 0 || dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * (1 - 1 / ((x * coefficient) / dimension + 1)) * dimension;
}
