import { Moment } from "@/types";

let cached: Moment | null = null;

export function setCachedMoment(m: Moment) {
  cached = m;
}

export function consumeCachedMoment(): Moment | null {
  const snap = cached;
  cached = null;
  return snap;
}
