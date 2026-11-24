import type { BrowseMeta } from "@/lib/browse";
import {
  INSIGHTS_MIN_MOMENTS,
  RESONATES_MIN_MOMENTS,
  TIME_MIN_MOMENTS,
  resonates,
  writingPattern,
} from "@/lib/insights";
import { MIN_REVIEW_MOMENTS } from "@/lib/yearInReview";

/**
 * What a small journal has coming (docs/PLAN-1.5.md, "6. Polish"): instead
 * of an empty Rediscover or Insights, the things that will show up there,
 * from the person's own moments, each with when or how many more moments.
 *
 * Pull, don't nag: these only say what's ahead, never what's missing
 * ("you haven't written in…"), and every row disappears by itself once the
 * thing it promises is there.
 */
export interface ComingUpRow {
  key: string;
  label: string;
  /** What it is, or when it comes. */
  subtitle: string;
  /** A short count on the right ("2 more"), when there is one. */
  detail?: string;
  /** The moment a row is about (On this day), opened on tap. */
  momentId?: string;
  artworkUrl?: string;
}

type Meta = Pick<BrowseMeta, "id" | "momentDate" | "songTitle" | "songArtworkUrl" | "songGenre" | "songReleaseDate" | "timeOfDay">;

const more = (n: number) => `${n} more`;
const moments = (n: number) => `${n} more moment${n === 1 ? "" : "s"}`;

function dayOf(date: string): Date {
  return new Date(date.slice(0, 10) + "T00:00:00");
}

function formatDay(d: Date, now: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * A journal with no moment a year old yet: nothing can come back "on this
 * day", so Rediscover is mostly waiting. Empty journals aren't small (they
 * get the empty state).
 */
export function isSmallJournal(meta: readonly Pick<Meta, "momentDate">[], now: Date = new Date()): boolean {
  const dated = meta.filter((m) => m.momentDate);
  if (dated.length === 0) return false;
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return dated.every((m) => dayOf(m.momentDate!) > yearAgo);
}

/**
 * Rediscover's "Coming up", only for a small journal:
 * - On this day: the first moment, a year on (its song and the date).
 * - Weekly rewind: while every moment is from this month, the rewind starts
 *   on the 1st of next month.
 * - Year in review: before December, when it opens; short of its minimum,
 *   how many more moments this year it needs.
 */
export function rediscoverComingUp(meta: readonly Meta[], now: Date = new Date()): ComingUpRow[] {
  if (!isSmallJournal(meta, now)) return [];
  const dated = meta
    .filter((m) => m.momentDate)
    .sort((a, b) => a.momentDate!.localeCompare(b.momentDate!));
  const rows: ComingUpRow[] = [];

  const first = dated[0];
  const firstDay = dayOf(first.momentDate!);
  const anniversary = new Date(firstDay.getFullYear() + 1, firstDay.getMonth(), firstDay.getDate());
  rows.push({
    key: "on_this_day",
    label: first.songTitle.trim() || "Your first moment",
    subtitle: `Comes back on this day, ${formatDay(anniversary, now)}`,
    momentId: first.id,
    artworkUrl: first.songArtworkUrl || undefined,
  });

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (dated.every((m) => m.momentDate!.slice(0, 7) === thisMonth)) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    rows.push({
      key: "rewind",
      label: "Weekly rewind",
      subtitle: `A month you wrote in, back each week from ${formatDay(nextMonth, now)}`,
    });
  }

  // Year in review shows in December and January (lib/yearInReview.ts);
  // in January it's last year's, which a small journal rarely has.
  const year = now.getFullYear();
  if (now.getMonth() !== 0) {
    const inYear = dated.filter((m) => m.momentDate!.startsWith(String(year))).length;
    const need = MIN_REVIEW_MOMENTS - inYear;
    const opens = now.getMonth() === 11 ? null : formatDay(new Date(year, 11, 1), now);
    if (need > 0) {
      rows.push({
        key: "year_review",
        label: `Your ${year} in review`,
        subtitle: opens ? `Opens ${opens}, with ${moments(need)} this year` : `Opens with ${moments(need)} this year`,
        detail: more(need),
      });
    } else if (opens) {
      rows.push({ key: "year_review", label: `Your ${year} in review`, subtitle: `Opens ${opens}` });
    }
  }
  return rows;
}

/**
 * Insights' sections that haven't shown up yet, with how many more moments
 * each needs. Under INSIGHTS_MIN_MOMENTS nothing shows, so every section is
 * listed; after that, only the ones still short of their own minimum (a
 * section with enough moments but no clear pattern isn't promised).
 */
export function insightsComingUp(meta: readonly Meta[]): ComingUpRow[] {
  const total = meta.length;
  const rows: ComingUpRow[] = [];

  if (total < INSIGHTS_MIN_MOMENTS) {
    rows.push({
      key: "artists",
      label: "Most written about",
      subtitle: "The artists you keep coming back to",
      detail: more(INSIGHTS_MIN_MOMENTS - total),
    });
    rows.push({
      key: "coming_back",
      label: "Songs you keep coming back to",
      subtitle: "Once a song turns up in more than one moment",
    });
  }

  const taste = resonates(meta);
  if (!taste?.genreLine && !taste?.periodLine) {
    const withGenre = meta.filter((m) => m.songGenre).length;
    const withYear = meta.filter((m) => m.songReleaseDate).length;
    const need = RESONATES_MIN_MOMENTS - Math.max(withGenre, withYear);
    if (need > 0) {
      rows.push({
        key: "resonates",
        label: "What resonates",
        subtitle: "The genres and decades you write to",
        detail: more(need),
      });
    }
  }

  const writing = writingPattern(meta);
  if (!writing?.line && !writing?.busiestMonth) {
    const timed = meta.filter((m) => m.timeOfDay).length;
    const need = TIME_MIN_MOMENTS - timed;
    if (need > 0) {
      rows.push({
        key: "when",
        label: "When you write",
        subtitle: "Mornings or late nights, and the days you reach for it",
        detail: more(need),
      });
    }
  }
  return rows;
}
