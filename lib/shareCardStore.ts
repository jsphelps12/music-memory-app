import type { PartialMoment } from "@/types";

// Consume-once hand-off from ShareMomentSheet to the share-card screen
// (app/share-card.tsx). Separate from momentCache: that slot is typed to card
// columns and belongs to the detail screen's entry, and the card also needs
// the moment's resolved photo URLs.
export interface ShareCardData {
  moment: PartialMoment;
  /** Public photo URLs, already resolved (getPublicPhotoUrl). */
  photoUrls: string[];
}

let pending: ShareCardData | null = null;

export function setShareCardData(data: ShareCardData) {
  pending = data;
}

export function consumeShareCardData(): ShareCardData | null {
  const snap = pending;
  pending = null;
  return snap;
}
