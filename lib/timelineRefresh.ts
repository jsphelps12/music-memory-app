// Module-level stale flag — any screen that mutates moments (create, edit, delete)
// calls markTimelineStale() before navigating back. The timeline checks this on
// focus and forces a silent refresh only when needed, skipping the refetch otherwise.
// Optionally accepts a newly created Moment so the timeline can prepend it
// instantly before the background network fetch completes.

import { Moment } from "@/types";

let _stale = false;
let _pendingMoment: Moment | null = null;
let _deletedMomentId: string | null = null;

export function markTimelineStale(moment?: Moment): void {
  _stale = true;
  if (moment) _pendingMoment = moment;
}

export function markTimelineDeleted(momentId: string): void {
  _stale = true;
  _deletedMomentId = momentId;
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
