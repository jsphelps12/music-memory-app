import type { MomentCardData } from "@/types";

// Card taps hand over what the card has, which is card-column data, not a full
// Moment. The detail screen renders it as a preview and fetches the full row.
let cached: MomentCardData | null = null;

export function setCachedMoment(m: MomentCardData) {
  cached = m;
}

export function consumeCachedMoment(): MomentCardData | null {
  const snap = cached;
  cached = null;
  return snap;
}
