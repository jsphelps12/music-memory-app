/**
 * Memory widget (1.5): which moment the widget shows on each of the next
 * days. Pure and tested (lib/__tests__/widgetPicks.test.ts); lib/widgetData.ts
 * feeds it the Journal's library and writes the result for the widget.
 *
 * Each day:
 *   1. "On this day": a moment from the same month and day in an earlier
 *      year ("3 years ago today").
 *   2. Otherwise a moment at least MIN_AGE_DAYS old, not shown in the
 *      RECENT_DAYS before that day and not already picked this week.
 * Ties are broken by a hash of user, day and moment, so a day's pick stays
 * the same however often the app rewrites the file, and a new moment only
 * changes it if it wins that day's draw.
 */

import { artworkUrlAtSize } from "@/lib/itunes";

export const WIDGET_DAYS = 7;
/** The fallback only shows moments at least this old. */
export const MIN_AGE_DAYS = 30;
/** A moment shown within this many days isn't picked again if there's another. */
export const RECENT_DAYS = 30;
/** Words on the widget: one line, about this long. */
export const LINE_MAX = 80;
/** Artwork size the widget gets (px, square). */
export const WIDGET_ARTWORK_PX = 300;

export interface WidgetSourceMoment {
  id: string;
  /** "YYYY-MM-DD" (moments.moment_date). */
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  artworkUrl: string;
  /** The reflection, passed only when words may be shown. */
  reflection?: string | null;
  /** ISO timestamp, the fallback date when momentDate is missing. */
  createdAt?: string | null;
}

export interface WidgetPick {
  /** The local day this entry is for, "YYYY-MM-DD". */
  day: string;
  momentId: string;
  title: string;
  artist: string;
  /** "3 years ago today" on its anniversary, otherwise the date. */
  dateLabel: string;
  /** Always the date ("March 12, 2023"): what a stale entry falls back to. */
  dateText: string;
  onThisDay: boolean;
  /** First line of the reflection, trimmed to about LINE_MAX, or null. */
  line: string | null;
  artworkUrl: string | null;
}

export interface PickInput {
  moments: readonly WidgetSourceMoment[];
  /** Day → moment id the widget showed on that day (days before `today`). */
  shown: Readonly<Record<string, string>>;
  /** Today, local, "YYYY-MM-DD". */
  today: string;
  /** Usually the user id: two people's picks don't line up. */
  seed: string;
  days?: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "YYYY-MM-DD" → [year, month, day], or null. */
function parts(day: string): [number, number, number] | null {
  const m = DAY_RE.exec(day);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Day arithmetic in UTC, so no daylight-saving change shifts a day. */
export function addDays(day: string, n: number): string {
  const p = parts(day);
  if (!p) return day;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** A moment's day: momentDate, else the local day it was created. */
export function momentDay(m: Pick<WidgetSourceMoment, "momentDate" | "createdAt">): string | null {
  if (m.momentDate && DAY_RE.test(m.momentDate)) return m.momentDate.slice(0, 10);
  if (m.createdAt) {
    const d = new Date(m.createdAt);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  return null;
}

/** "March 12, 2023". */
export function longDate(day: string): string {
  const p = parts(day);
  if (!p) return day;
  return `${MONTHS[p[1] - 1]} ${p[2]}, ${p[0]}`;
}

/** "A year ago today", "3 years ago today". */
export function yearsAgoToday(years: number): string {
  return years === 1 ? "A year ago today" : `${years} years ago today`;
}

/**
 * The first non-empty line of a reflection, whitespace collapsed, cut at a
 * word under `max` characters with an ellipsis. Null when there's nothing.
 */
export function firstLine(text: string | null | undefined, max = LINE_MAX): string | null {
  if (!text) return null;
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  // A long first word is cut where it is rather than dropped.
  const head = (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "");
  return `${head}…`;
}

/**
 * A stable, well-spread 32-bit number for a string: FNV-1a, then Murmur3's
 * finaliser. FNV alone barely moves the high bits when only the last
 * character differs ("extra1" vs "extra2"), so similar ids drew alike.
 */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

interface Candidate {
  m: WidgetSourceMoment;
  day: string;
}

/**
 * The widget's picks for `days` days from `today`. A day with nothing to
 * show (no moment old enough yet) is left out.
 */
export function pickWidgetMoments({ moments, shown, today, seed, days = WIDGET_DAYS }: PickInput): WidgetPick[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const m of moments) {
    if (!m.id || seen.has(m.id)) continue;
    const day = momentDay(m);
    if (!day) continue;
    seen.add(m.id);
    candidates.push({ m, day });
  }

  // Everything known to be shown, by day: what the widget showed before
  // today, then this run's picks as they're made.
  const byDay = new Map<string, string>(Object.entries(shown).filter(([d]) => d < today));
  const pickedThisRun = new Set<string>();
  const picks: WidgetPick[] = [];

  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const p = parts(day);
    if (!p) break;
    const [year, month, date] = p;

    // When each moment was last shown within RECENT_DAYS before this day.
    // Relative to the day being picked, not to today, so tomorrow's pick
    // is the same whether it's worked out today or tomorrow.
    const windowStart = addDays(day, -RECENT_DAYS);
    const lastShown = new Map<string, string>();
    for (const [d, id] of byDay) {
      if (d >= windowStart && d < day && (lastShown.get(id) ?? "") < d) lastShown.set(id, d);
    }

    const draw = (c: Candidate) => hash(`${seed}:${day}:${c.m.id}`);
    // Lowest first: fresh beats shown recently beats picked this week; among
    // ones already shown, the longest ago; then the day's draw.
    const rank = (a: Candidate, b: Candidate) => {
      const tier = (c: Candidate) => (pickedThisRun.has(c.m.id) ? 2 : lastShown.has(c.m.id) ? 1 : 0);
      const t = tier(a) - tier(b);
      if (t !== 0) return t;
      const la = lastShown.get(a.m.id) ?? "";
      const lb = lastShown.get(b.m.id) ?? "";
      if (la !== lb) return la < lb ? -1 : 1;
      return draw(a) - draw(b);
    };

    const anniversaries = candidates.filter((c) => {
      const cp = parts(c.day)!;
      return cp[1] === month && cp[2] === date && cp[0] < year;
    });
    const oldEnough = addDays(day, -MIN_AGE_DAYS);
    const pool = anniversaries.length > 0 ? anniversaries : candidates.filter((c) => c.day <= oldEnough);
    if (pool.length === 0) continue;

    const chosen = [...pool].sort(rank)[0];
    const onThisDay = anniversaries.length > 0;
    const dateText = longDate(chosen.day);
    picks.push({
      day,
      momentId: chosen.m.id,
      title: chosen.m.songTitle,
      artist: chosen.m.songArtist,
      dateLabel: onThisDay ? yearsAgoToday(year - parts(chosen.day)![0]) : dateText,
      dateText,
      onThisDay,
      line: firstLine(chosen.m.reflection),
      artworkUrl: chosen.m.artworkUrl ? artworkUrlAtSize(chosen.m.artworkUrl, WIDGET_ARTWORK_PX) : null,
    });
    pickedThisRun.add(chosen.m.id);
    byDay.set(day, chosen.m.id);
  }
  return picks;
}

/**
 * The "shown" record after a run: yesterday and earlier's planned picks
 * become history (the widget showed them), trimmed to what RECENT_DAYS can
 * still see. `planned` is the last file's day → moment id.
 */
export function rollShown(
  shown: Readonly<Record<string, string>>,
  planned: Readonly<Record<string, string>>,
  today: string
): Record<string, string> {
  const keepFrom = addDays(today, -RECENT_DAYS - WIDGET_DAYS);
  const out: Record<string, string> = {};
  for (const [d, id] of [...Object.entries(shown), ...Object.entries(planned)]) {
    if (d < today && d >= keepFrom) out[d] = id;
  }
  return out;
}
