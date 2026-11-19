import { useSyncExternalStore } from "react";

// Whether the Journal is in select mode, for the parts of the app outside
// the Journal screen that change with it: the tab bar hides the floating
// capture button while moments are being selected (as Photos and Files hide
// their add button), so the Add to album / Delete bar has the bottom to itself.

let selecting = false;
const listeners = new Set<() => void>();

export function setJournalSelecting(next: boolean): void {
  if (next === selecting) return;
  selecting = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useJournalSelecting(): boolean {
  return useSyncExternalStore(subscribe, () => selecting);
}
