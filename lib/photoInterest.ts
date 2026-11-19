// What makes a photo worth suggesting (1.4). The native module
// (modules/on-device-ai) reports what Apple's on-device models see; this
// decides, purely and testably (lib/__tests__/photoInterest.test.ts):
// - boring: documents, receipts, whiteboards, homework, screenshots of text.
//   Never suggested, and not counted toward "a week with lots of photos".
// - interest: Apple's aesthetics score, with a nudge for people.
// - event: what kind of week it was (beach, concert, wedding…), from scene
//   labels seen in more than one photo.

import type { PhotoAnalysis } from "@/modules/on-device-ai";

/** More of the frame than this in text reads as a document. */
export const TEXT_HEAVY = 0.12;
/** Labels that mean "not a memory", at this confidence or more. */
const BORING_LABELS = new Set([
  "document",
  "paper",
  "text",
  "receipt",
  "whiteboard",
  "blackboard",
  "handwriting",
  "screenshot",
  "menu",
  "printed_page",
  "notebook",
  "book",
  "computer_monitor",
  "screen",
]);
const BORING_CONFIDENCE = 0.5;

export function isBoring(a: PhotoAnalysis): boolean {
  if (a.utility === true) return true;
  if (a.textCoverage > TEXT_HEAVY) return true;
  return a.labels.some(([label, conf]) => conf >= BORING_CONFIDENCE && BORING_LABELS.has(label));
}

/** Higher is more worth showing: aesthetics, plus people, minus boring. */
export function interest(a: PhotoAnalysis): number {
  let score = a.aesthetic ?? 0;
  if (a.faces >= 2) score += 0.3;
  else if (a.faces === 1) score += 0.15;
  if (isBoring(a)) score -= 2;
  return score;
}

export type EventKind = "beach" | "mountains" | "snow" | "concert" | "wedding" | "party" | "game" | "city" | "nature";

const EVENT_LABELS: Record<EventKind, string[]> = {
  beach: ["beach", "ocean", "sea", "shore", "coast", "sand", "surfboard", "swimming_pool"],
  mountains: ["mountain", "hiking", "cliff", "canyon", "valley"],
  snow: ["snow", "skiing", "snowboarding", "ski"],
  concert: ["concert", "stage", "performance", "musical_instrument", "guitar", "drum", "microphone"],
  wedding: ["wedding", "bride", "wedding_dress", "groom"],
  party: ["party", "celebration", "birthday_cake", "balloon", "fireworks", "confetti"],
  game: ["stadium", "sport", "arena", "baseball", "basketball", "soccer", "football"],
  city: ["skyscraper", "cityscape", "bridge", "landmark", "tower"],
  nature: ["forest", "lake", "waterfall", "river", "national_park"],
};

const EVENT_CONFIDENCE = 0.4;

/** The event kinds one photo shows. */
export function eventsIn(a: PhotoAnalysis): EventKind[] {
  const out: EventKind[] = [];
  for (const [kind, labels] of Object.entries(EVENT_LABELS) as [EventKind, string[]][]) {
    if (a.labels.some(([label, conf]) => conf >= EVENT_CONFIDENCE && labels.includes(label))) out.push(kind);
  }
  return out;
}

export interface WeekLook {
  /** Share of analysed photos that were boring, 0–1. */
  boringShare: number;
  /** The kind of week, when two or more photos agree. */
  event: EventKind | null;
  /** Photos with two or more faces. */
  groupShots: number;
  /** Analysed, non-boring photo ids, most interesting first. */
  bestIds: string[];
}

export function lookAtWeek(analyses: PhotoAnalysis[]): WeekLook {
  if (analyses.length === 0) return { boringShare: 0, event: null, groupShots: 0, bestIds: [] };
  const boring = analyses.filter(isBoring);
  const kept = analyses.filter((a) => !isBoring(a));
  const counts = new Map<EventKind, number>();
  for (const a of kept) for (const e of eventsIn(a)) counts.set(e, (counts.get(e) ?? 0) + 1);
  let event: EventKind | null = null;
  let best = 1;
  for (const [kind, n] of counts) {
    if (n > best) {
      event = kind;
      best = n;
    }
  }
  return {
    boringShare: boring.length / analyses.length,
    event,
    groupShots: kept.filter((a) => a.faces >= 2).length,
    bestIds: [...kept].sort((a, b) => interest(b) - interest(a)).map((a) => a.id),
  };
}

/** How much a week's look adds to its From before score. */
export function lookBonus(look: WeekLook): number {
  return (look.event ? 1.5 : 0) + Math.log2(1 + look.groupShots) * 0.75;
}

/** "at the beach", for the reason line. */
export function eventPhrase(kind: EventKind): string {
  switch (kind) {
    case "beach":
      return "at the beach";
    case "mountains":
      return "in the mountains";
    case "snow":
      return "in the snow";
    case "concert":
      return "at a show";
    case "wedding":
      return "at a wedding";
    case "party":
      return "a celebration";
    case "game":
      return "at a game";
    case "city":
      return "in the city";
    case "nature":
      return "outdoors";
  }
}

/** Evenly spaced picks from a list, at most `n`, keeping order. */
export function sampleEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}
