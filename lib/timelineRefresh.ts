// Module-level stale flag — any screen that mutates moments (create, edit, delete)
// calls markTimelineStale() before navigating back. The timeline checks this on
// focus and forces a silent refresh only when needed, skipping the refetch otherwise.
// Optionally accepts a newly created Moment so the timeline can prepend it
// instantly before the background network fetch completes.

import { Moment } from "@/types";

let _stale = false;
let _pendingMoment: Moment | null = null;
let _deletedMomentId: string | null = null;
// A brief notice for whichever list screen capture closes back to ("Saved on
// your phone…" after an offline save, lib/outboxUi.ts). Consumed once.
let _notice: string | null = null;
// When moments last changed on this device. Unlike the flag, consuming doesn't
// reset it: a timeline prefetch started before this time predates the change
// and must not be painted (see isPrefetchFresh in timelinePrefetch.ts).
let _lastMarkedAt = 0;

export function markTimelineStale(moment?: Moment): void {
  _stale = true;
  _lastMarkedAt = Date.now();
  if (moment) _pendingMoment = moment;
}

export function markTimelineDeleted(momentId: string): void {
  _stale = true;
  _lastMarkedAt = Date.now();
  _deletedMomentId = momentId;
}

/** Epoch ms of the last markTimelineStale / markTimelineDeleted, 0 if none. */
export function lastTimelineMarkAt(): number {
  return _lastMarkedAt;
}

/**
 * Drop any pending state. Called on sign-out: the pending Moment is not scoped
 * to a user, so leaving it set would prepend the signed-out user's moment to the
 * next user's timeline on this device.
 */
export function resetTimelineRefresh(): void {
  _stale = false;
  _pendingMoment = null;
  _deletedMomentId = null;
  _lastMarkedAt = 0;
  _notice = null;
}

/** Leaves a notice for the next Journal or album screen to gain focus. */
export function setListNotice(text: string): void {
  _notice = text;
}

/** The notice left by setListNotice, once; null when there's none. */
export function consumeListNotice(): string | null {
  const n = _notice;
  _notice = null;
  return n;
}

export function consumeTimelineStale(): { stale: boolean; pendingMoment: Moment | null; deletedMomentId: string | null } {
  const stale = _stale;
  const pendingMoment = _pendingMoment;
  const deletedMomentId = _deletedMomentId;
  _stale = false;
  _pendingMoment = null;
  _deletedMomentId = null;
  return { stale, pendingMoment, deletedMomentId };
}

export type FocusFetch =
  /** First load, served from the prefetch (disk cache / auth-time network fetch). */
  | "initial"
  /** First load, but something changed since the prefetch fired: go to the network. */
  | "initial_fresh"
  /** Silent background refresh of page 0. */
  | "refresh"
  | "none";

/**
 * What the timeline should fetch when it gains focus. Pure, so it's testable.
 *
 * The "initial_fresh" case is the onboarding bug (2026-11-13): the prefetch
 * fires when auth resolves, which for a new user is *before* onboarding saves
 * their first moments. The Journal tab first mounts after onboarding, so its
 * first focus saw the stale flag but still took the prefetch, an empty list,
 * and the flag was gone. A stale flag set before the first load means the
 * prefetch can't be trusted.
 */
export function planFocusFetch(opts: {
  hasFetched: boolean;
  stale: boolean;
  elapsedMs: number;
  cooldownMs: number;
}): FocusFetch {
  if (!opts.hasFetched) return opts.stale ? "initial_fresh" : "initial";
  if (opts.stale || opts.elapsedMs >= opts.cooldownMs) return "refresh";
  return "none";
}
