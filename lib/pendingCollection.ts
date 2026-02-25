// Module-level store for a collection to auto-select after navigation
// (e.g. after joining via invite link). Same pattern as cardTransition.ts.

let pendingCollectionId: string | null = null;

export function setPendingCollectionId(id: string) {
  pendingCollectionId = id;
}

// Read once and reset — call after collections are loaded
export function consumePendingCollectionId(): string | null {
  const id = pendingCollectionId;
  pendingCollectionId = null;
  return id;
}
