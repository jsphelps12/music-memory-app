// The question capture opens with for a pairing (1.4): "What was playing on
// the drive to Kona?" On a phone with Apple Intelligence it comes from Apple's
// on-device model, given only facts; everywhere else, and whenever the
// model's answer fails the checks below, from a plain template. It asks; it
// never answers or writes for the person (PRODUCT.md, Brand Commitments).
// Pure parts are tested in lib/__tests__/nudgeQuestion.test.ts.

import { eventPhrase, type EventKind } from "@/lib/photoInterest";

export interface QuestionFacts {
  song: string;
  artist: string;
  /** When it was added, epoch ms. */
  at: number;
  place?: string | null;
  event?: EventKind | null;
  photoCount?: number;
  away?: boolean;
}

/** The facts as plain lines for the model; nothing else is sent to it. */
export function factsText(f: QuestionFacts): string {
  const when = new Date(f.at).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return [
    `Song: ${f.song} by ${f.artist}`,
    `They added it to their library in ${when}`,
    f.away ? `They were away from home${f.place ? `, in ${f.place}` : ""}` : null,
    f.event ? `Their photos that week were ${eventPhrase(f.event)}` : null,
    f.photoCount ? `They took ${f.photoCount} photos that week` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const MAX_LEN = 90;
const FIRST_PERSON = /\b(i|i'm|i've|i'd|me|my|mine)\b/i;

/**
 * A model's question, cleaned, or null if it isn't one: a single line ending
 * in "?", short, not in the person's voice, and naming no place that wasn't
 * in the facts.
 */
export function validQuestion(raw: string | null | undefined, f: QuestionFacts): string | null {
  if (!raw) return null;
  const q = raw.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!q || q.includes("\n") || q.length > MAX_LEN || !q.endsWith("?")) return null;
  if (FIRST_PERSON.test(q)) return null;
  // Capitalised words that aren't the song, artist or place smell invented.
  const allowed = `${f.song} ${f.artist} ${f.place ?? ""}`.toLowerCase();
  const names = q.slice(1).match(/\b[A-Z][a-z]+/g) ?? [];
  if (names.some((n) => !allowed.includes(n.toLowerCase()))) return null;
  return q;
}

/** The plain question, used when the model can't be. */
export function templateQuestion(f: QuestionFacts): string {
  if (f.away && f.place) return `What was playing while you were in ${f.place}?`;
  if (f.event) return `What do you remember from that week ${eventPhrase(f.event)}?`;
  if (f.away) return "Where were you when this was on repeat?";
  return `What was going on when you found ${f.song}?`;
}
