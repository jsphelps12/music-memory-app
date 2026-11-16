// Year in review (Phase 3, "Payoff"): a tap-through story of a year in the
// journal, each card playing its song. Free; featured in Rediscover from
// December 1 to January 31 and open any time from You for a year with enough
// moments (decided 2026-11-16). No AI: every line is a template filled from
// the user's own moments, and their words appear only as their own quotes.
//
// Pure (no I/O); the screen fetches with YEAR_REVIEW_COLUMNS and renders.
// Tested in lib/__tests__/yearInReview.test.ts.

/** The fields the story reads; a Moment from YEAR_REVIEW_COLUMNS satisfies it. */
export interface ReviewMoment {
  id: string;
  songTitle: string;
  songArtist: string;
  songArtworkUrl: string;
  songAppleMusicId: string | null;
  songSpotifyId: string | null;
  songPreviewUrl: string | null;
  songProvider?: string;
  songAlbumName?: string;
  reflectionText: string;
  moods: string[];
  people?: string[];
  location?: string | null;
  momentDate: string | null;
  createdAt: string;
}

/** A year needs at least this many moments to get a review (thinner years get a teaser). */
export const MIN_REVIEW_MOMENTS = 5;

export type Chapter =
  | { kind: "cover"; moment: ReviewMoment; total: number; songCount: number; artwork: string[] }
  | { kind: "month"; moment: ReviewMoment; monthKey: string; count: number; artwork: string[] }
  | { kind: "mood"; moment: ReviewMoment; mood: string; count: number; others: string[] }
  | { kind: "person"; moment: ReviewMoment; person: string; count: number }
  | { kind: "place"; moment: ReviewMoment; place: string; count: number }
  | { kind: "words"; moment: ReviewMoment; excerpt: string }
  | { kind: "closing"; moment: ReviewMoment; total: number; artwork: string[] };

export interface YearReview {
  year: number;
  total: number;
  chapters: Chapter[];
}

/** The date a moment belongs to: its moment date, else when it was saved. */
function dayOf(m: Pick<ReviewMoment, "momentDate" | "createdAt">): string {
  return (m.momentDate ?? m.createdAt).slice(0, 10);
}

export function yearOf(m: Pick<ReviewMoment, "momentDate" | "createdAt">): number {
  return Number(dayOf(m).slice(0, 4));
}

/** Oldest first, by day then by when it was saved. */
function chronological<T extends Pick<ReviewMoment, "momentDate" | "createdAt">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const d = dayOf(a).localeCompare(dayOf(b));
    return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
  });
}

/** The moment with the most writing; ties go to the earlier one. */
function mostWritten<T extends ReviewMoment>(list: T[]): T {
  return list.reduce((best, m) =>
    m.reflectionText.trim().length > best.reflectionText.trim().length ? m : best
  );
}

/** Counts a key per moment (each key once per moment), highest first, ties alphabetical. */
function rank(list: ReviewMoment[], keys: (m: ReviewMoment) => string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of list) {
    for (const k of new Set(keys(m).map((x) => x.trim()).filter(Boolean))) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Distinct artwork in order, up to `max`. */
function artworkOf(list: ReviewMoment[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of list) {
    if (m.songArtworkUrl && !seen.has(m.songArtworkUrl)) {
      seen.add(m.songArtworkUrl);
      out.push(m.songArtworkUrl);
      if (out.length === max) break;
    }
  }
  return out;
}

const songKey = (m: ReviewMoment) =>
  m.songAppleMusicId ?? m.songSpotifyId ?? `${m.songTitle.toLowerCase()}|${m.songArtist.toLowerCase()}`;

/**
 * A quote that ends on a word, not mid-word, with an ellipsis when cut.
 * Collapses blank lines so a long entry reads as one passage.
 */
export function excerpt(text: string, max = 240): string {
  const flat = text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * The story for one year, or null when the year is too thin (fewer than
 * MIN_REVIEW_MOMENTS). Chapters that have nothing true to say are left out:
 * no loudest month without a month of two, no person seen only once.
 */
export function buildYearReview(all: ReviewMoment[], year: number): YearReview | null {
  const moments = chronological(all.filter((m) => yearOf(m) === year));
  if (moments.length < MIN_REVIEW_MOMENTS) return null;

  const total = moments.length;
  const first = moments[0];
  const last = moments[moments.length - 1];
  const chapters: Chapter[] = [];
  const used = new Set<string>();

  // The quote card's moment is chosen first and kept for that card, so the
  // other cards don't all reach for the same well-written entry.
  const wrote = moments.filter((m) => m.reflectionText.trim().length >= 40);
  const quoted = wrote.length > 0 ? mostWritten(wrote) : null;
  if (quoted) used.add(quoted.id);

  // Each card plays a different song where it can, so the story doesn't
  // repeat itself; when every option was used, anything but the quoted one.
  const pick = (candidates: ReviewMoment[]): ReviewMoment => {
    const fresh = candidates.filter((m) => !used.has(m.id));
    const notQuoted = candidates.filter((m) => m.id !== quoted?.id);
    const chosen = mostWritten(fresh.length ? fresh : notQuoted.length ? notQuoted : candidates);
    used.add(chosen.id);
    return chosen;
  };

  used.add(first.id);
  chapters.push({
    kind: "cover",
    moment: first,
    total,
    songCount: new Set(moments.map(songKey)).size,
    artwork: artworkOf(moments, 9),
  });

  // The loudest month: the most moments, ties to the earlier month.
  const byMonth = rank(moments, (m) => [dayOf(m).slice(0, 7)]).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key)
  );
  const month = byMonth[0];
  if (month && month.count >= 2) {
    const inMonth = moments.filter((m) => dayOf(m).startsWith(month.key));
    chapters.push({
      kind: "month",
      moment: pick(inMonth),
      monthKey: month.key,
      count: month.count,
      artwork: artworkOf(inMonth, 4),
    });
  }

  const moods = rank(moments, (m) => m.moods);
  if (moods[0] && moods[0].count >= 2) {
    const top = moods[0];
    chapters.push({
      kind: "mood",
      moment: pick(moments.filter((m) => m.moods.includes(top.key))),
      mood: top.key,
      count: top.count,
      others: moods.slice(1, 3).filter((x) => x.count >= 2).map((x) => x.key),
    });
  }

  const people = rank(moments, (m) => m.people ?? []);
  if (people[0] && people[0].count >= 2) {
    const top = people[0];
    chapters.push({
      kind: "person",
      moment: pick(moments.filter((m) => (m.people ?? []).some((p) => p.trim() === top.key))),
      person: top.key,
      count: top.count,
    });
  }

  const places = rank(moments, (m) => (m.location ? [m.location] : []));
  if (places[0] && places[0].count >= 2) {
    const top = places[0];
    chapters.push({
      kind: "place",
      moment: pick(moments.filter((m) => m.location?.trim() === top.key)),
      place: top.key,
      count: top.count,
    });
  }

  // The one written about most, when anything was written at all.
  if (quoted) {
    chapters.push({ kind: "words", moment: quoted, excerpt: excerpt(quoted.reflectionText) });
  }

  chapters.push({ kind: "closing", moment: last, total, artwork: artworkOf(moments, 30) });

  return { year, total, chapters };
}

/**
 * Which year Rediscover features, if any: December shows the year that's
 * ending, January the one just ended, any other month nothing.
 */
export function featuredReviewYear(now: Date): number | null {
  const month = now.getMonth(); // 0 = January
  if (month === 11) return now.getFullYear();
  if (month === 0) return now.getFullYear() - 1;
  return null;
}

/** Years with enough moments for a review, newest first. */
export function eligibleReviewYears(
  items: Pick<ReviewMoment, "momentDate" | "createdAt">[] | { momentDate: string | null }[],
  min = MIN_REVIEW_MOMENTS
): number[] {
  const counts = new Map<number, number>();
  for (const m of items) {
    const date = m.momentDate ?? ("createdAt" in m ? m.createdAt : null);
    if (!date) continue;
    const y = Number(date.slice(0, 4));
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .map(([y]) => y)
    .sort((a, b) => b - a);
}

/** "twice", "3 times". */
export function timesWord(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

/** "2026-10" → "October". */
export function monthName(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" });
}
