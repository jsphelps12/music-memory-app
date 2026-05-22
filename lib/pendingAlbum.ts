// Module-level store for an album to auto-select after navigation
// (e.g. after joining via invite link). Same pattern as cardTransition.ts.

let pendingAlbumId: string | null = null;

export function setPendingAlbumId(id: string) {
  pendingAlbumId = id;
}

// Read once and reset — call after albums are loaded
export function consumePendingAlbumId(): string | null {
  const id = pendingAlbumId;
  pendingAlbumId = null;
  return id;
}
