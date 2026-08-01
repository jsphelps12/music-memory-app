// Module-level consume-once signal (same shape as momentCache/cardTransition/
// timelineRefresh): the timeline's search icon switches to the Reflections tab
// and wants the search bar focused on arrival. Router params would linger and
// re-trigger on every later focus; this fires exactly once.

let _requested = false;

export function requestReflectionsSearch(): void {
  _requested = true;
}

export function consumeReflectionsSearchRequest(): boolean {
  const requested = _requested;
  _requested = false;
  return requested;
}
