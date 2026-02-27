// Module-level stale flag — any screen that mutates moments (create, edit, delete)
// calls markTimelineStale() before navigating back. The timeline checks this on
// focus and forces a silent refresh only when needed, skipping the refetch otherwise.

let _stale = false;

export function markTimelineStale(): void {
  _stale = true;
}

export function consumeTimelineStale(): boolean {
  const was = _stale;
  _stale = false;
  return was;
}
