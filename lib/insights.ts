// What a journal says about its writer, computed on the phone from the browse
// metadata the app already loads (one row per moment). Pure; tested in
// lib/__tests__/insights.test.ts. The You preview and app/insights.tsx read
// it; new insights get added here first.
//
// Deliberately no streaks or "days missed": they count absence, which the app
// never nags about (CLAUDE.md, Notifications; PRODUCT.md "Pull, don't nag").

export interface InsightMoment {
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  songArtworkUrl: string;
  moods: readonly string[];
  people: readonly string[];
  /** iTunes primary genre as Apple writes it ("Hip-Hop/Rap"); absent for older or non-catalog songs. */
  songGenre?: string | null;
  /** The song's release date ("YYYY-MM-DD"); absent when unknown. */
  songReleaseDate?: string | null;
  /** When it was written, from the phone's clock at save: "Morning", "Afternoon", "Evening", "Late Night". */
  timeOfDay?: string | null;
}

export interface RankedArtist {
  name: string;
  count: number;
  /** Artwork from this artist's most recent moment that has any. */
  artworkUrl: string | null;
  /** The song on this artist's most recent moment. */
  latestSong: string;
}

export interface Ranked {
  /** The value as stored (a mood value, a person's name). */
  value: string;
  count: number;
}

export interface Insights {
  moments: number;
  songs: number;
  artists: number;
  /** Most written-about artists, most moments first; ties keep first-seen order. */
  topArtists: RankedArtist[];
  /** People tagged most often. */
  featuring: Ranked[];
  /** Mood values used most often, with how many moments carry each. */
  moods: Ranked[];
}

/** Below this the journal is too small to say anything about. */
export const INSIGHTS_MIN_MOMENTS = 3;

/**
 * An artist is "most written about" only from this many moments: a ranking
 * of artists who each appear once is a list, not an insight (2026-11-20).
 */
export const REPEAT_MIN = 2;

/** Artists with at least REPEAT_MIN moments, most first, at most `max`. */
export function repeatArtists(i: Pick<Insights, "topArtists">, max: number): RankedArtist[] {
  return i.topArtists.filter((a) => a.count >= REPEAT_MIN).slice(0, max);
}

/**
 * The artists section: "Most written about" once anyone repeats; before that,
 * "Artists so far", the most recent ones (there's always something to show).
 */
export function artistHighlights(
  i: Pick<Insights, "topArtists">,
  max: number
): { kind: "repeats" | "recent"; artists: RankedArtist[] } {
  const repeats = repeatArtists(i, max);
  if (repeats.length > 0) return { kind: "repeats", artists: repeats };
  // All tied at one: topArtists keeps first-seen order, i.e. most recent first.
  return { kind: "recent", artists: i.topArtists.slice(0, max) };
}

const norm = (s: string) => s.trim().toLowerCase();

function rank(counts: Map<string, Ranked>): Ranked[] {
  // Map preserves insertion order, and sort is stable, so ties stay first-seen.
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/**
 * `meta` is expected newest first (as the browse metadata comes), which makes
 * "first seen" mean "most recent" for ties and artwork.
 */
export function journalInsights(meta: readonly InsightMoment[]): Insights {
  const songs = new Set<string>();
  const artists = new Map<string, RankedArtist>();
  const people = new Map<string, Ranked>();
  const moods = new Map<string, Ranked>();

  for (const m of meta) {
    const artist = m.songArtist?.trim() ?? "";
    const title = m.songTitle?.trim() ?? "";
    if (title) songs.add(`${norm(title)}\u0000${norm(artist)}`);

    if (artist) {
      const key = norm(artist);
      const entry = artists.get(key);
      if (entry) {
        entry.count += 1;
        if (!entry.artworkUrl && m.songArtworkUrl) entry.artworkUrl = m.songArtworkUrl;
      } else {
        artists.set(key, { name: artist, count: 1, artworkUrl: m.songArtworkUrl || null, latestSong: title });
      }
    }

    // A person or mood counts once per moment, however it was entered.
    const seenPeople = new Set<string>();
    for (const raw of m.people ?? []) {
      const name = raw?.trim();
      if (!name) continue;
      const key = norm(name);
      if (seenPeople.has(key)) continue;
      seenPeople.add(key);
      const entry = people.get(key);
      if (entry) entry.count += 1;
      else people.set(key, { value: name, count: 1 });
    }

    const seenMoods = new Set<string>();
    for (const value of m.moods ?? []) {
      if (!value || seenMoods.has(value)) continue;
      seenMoods.add(value);
      const entry = moods.get(value);
      if (entry) entry.count += 1;
      else moods.set(value, { value, count: 1 });
    }
  }

  const topArtists = [...artists.values()].sort((a, b) => b.count - a.count);

  return {
    moments: meta.length,
    songs: songs.size,
    artists: artists.size,
    topArtists,
    featuring: rank(people),
    moods: rank(moods),
  };
}

/** "42 moments · 37 songs · 21 artists" */
export function insightsSummary(i: Pick<Insights, "moments" | "songs" | "artists">): string {
  const n = (count: number, one: string, many: string) =>
    `${count.toLocaleString()} ${count === 1 ? one : many}`;
  return [n(i.moments, "moment", "moments"), n(i.songs, "song", "songs"), n(i.artists, "artist", "artists")].join(
    " · "
  );
}

export interface ComingBackSong {
  /** Title and artist as stored on the most recent moment (the song screen matches them exactly). */
  title: string;
  artist: string;
  /** Artwork from the most recent moment that has any. */
  artworkUrl: string | null;
  /** Moments written to this song. */
  count: number;
  /** The dated moments' dates ("YYYY-MM-DD"), oldest first; undated moments count but aren't listed. */
  dates: string[];
}

// An undated moment ranks below any dated one when picking "most recent".
const newer = (a: string | null, b: string | null) => a !== null && (b === null || a > b);

/**
 * "Songs you keep coming back to": songs written about in REPEAT_MIN or more
 * moments, the song as the index of a life. Grouped by title and artist (case
 * and spaces aside; the same title by two artists is two songs). Most moments
 * first, then the most recently written to; ties keep first-seen order. A
 * moment with no title or no artist is left out (the song screen needs both).
 * `meta` is expected newest first, as for journalInsights.
 */
export function comingBack(
  meta: readonly Pick<InsightMoment, "momentDate" | "songTitle" | "songArtist" | "songArtworkUrl">[],
  max: number
): ComingBackSong[] {
  const songs = new Map<string, ComingBackSong & { latest: string | null; artDate: string | null }>();

  for (const m of meta) {
    const title = m.songTitle?.trim() ?? "";
    const artist = m.songArtist?.trim() ?? "";
    if (!title || !artist) continue;
    const key = `${norm(title)}\u0000${norm(artist)}`;
    const date = m.momentDate || null;
    const art = m.songArtworkUrl || null;
    const entry = songs.get(key);
    if (!entry) {
      songs.set(key, {
        title: m.songTitle,
        artist: m.songArtist,
        artworkUrl: art,
        count: 1,
        dates: date ? [date] : [],
        latest: date,
        artDate: art ? date : null,
      });
      continue;
    }
    entry.count += 1;
    if (date) entry.dates.push(date);
    if (newer(date, entry.latest)) {
      entry.latest = date;
      entry.title = m.songTitle;
      entry.artist = m.songArtist;
    }
    if (art && (!entry.artworkUrl || newer(date, entry.artDate))) {
      entry.artworkUrl = art;
      entry.artDate = date;
    }
  }

  return [...songs.values()]
    .filter((s) => s.count >= REPEAT_MIN)
    .sort((a, b) => b.count - a.count || (newer(a.latest, b.latest) ? -1 : newer(b.latest, a.latest) ? 1 : 0))
    .slice(0, max)
    .map(({ title, artist, artworkUrl, count, dates }) => ({
      title,
      artist,
      artworkUrl,
      count,
      dates: [...dates].sort(),
    }));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Past this many years or months a list stops being glanceable: the span is shown instead. */
const WHEN_MAX_PARTS = 4;

/**
 * When a song came back, as one glanceable line:
 * - across years: the years, oldest first, the current one as "this year"
 *   ("2019 · 2023 · this year"); more than four become "2012 to this year";
 * - within one year: the months ("March · July · November"), followed by the
 *   year unless it's this one ("March · July 2021"); more than four become
 *   "February to November";
 * - otherwise (one month, or no dates): "3 times".
 * `dates` are "YYYY-MM-DD" in any order; anything else is ignored.
 */
export function comingBackWhen(dates: readonly string[], count: number, now: Date = new Date()): string {
  const thisYear = now.getFullYear();
  const parsed = dates
    .map((d) => /^(\d{4})-(\d{2})/.exec(d))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ year: Number(m[1]), month: Number(m[2]) }))
    .filter((d) => d.month >= 1 && d.month <= 12);

  const years = [...new Set(parsed.map((d) => d.year))].sort((a, b) => a - b);
  if (years.length > 1) {
    const year = (y: number) => (y === thisYear ? "this year" : String(y));
    if (years.length > WHEN_MAX_PARTS) return `${year(years[0])} to ${year(years[years.length - 1])}`;
    return years.map(year).join(" · ");
  }

  const months = [...new Set(parsed.map((d) => d.month))].sort((a, b) => a - b);
  if (months.length > 1) {
    const names = months.map((mo) => MONTHS[mo - 1]);
    const line = names.length > WHEN_MAX_PARTS ? `${names[0]} to ${names[names.length - 1]}` : names.join(" · ");
    return years[0] === thisYear ? line : `${line} ${years[0]}`;
  }

  return `${count.toLocaleString()} ${count === 1 ? "time" : "times"}`;
}

// ---------------------------------------------------------------------------
// What resonates: genres and periods of music
// ---------------------------------------------------------------------------

/** Below this many moments with a genre (or a release year), that half of the section is left out. */
export const RESONATES_MIN_MOMENTS = 3;

/** Apple's catch-all genre: it says nothing about taste, so it isn't counted. */
const GENRE_IGNORED = new Set(["music"]);

/**
 * Spellings of the same family folded into Apple's top-level name. Exact
 * aliases only, deliberately not a taxonomy ("Soul" stays its own genre).
 */
const GENRE_ALIASES: Record<string, string> = {
  "hip-hop/rap": "Hip-Hop/Rap",
  "hip-hop": "Hip-Hop/Rap",
  "hip hop": "Hip-Hop/Rap",
  rap: "Hip-Hop/Rap",
  "r&b/soul": "R&B/Soul",
  "r&b": "R&B/Soul",
};

/** Words that stay capitalized in a sentence, so the genre keeps Apple's spelling. */
const GENRE_PROPER_WORDS = new Set([
  "african",
  "americana",
  "arabic",
  "bollywood",
  "brazilian",
  "broadway",
  "cajun",
  "caribbean",
  "celtic",
  "chinese",
  "christian",
  "christmas",
  "disney",
  "french",
  "german",
  "greek",
  "halloween",
  "hawaiian",
  "indian",
  "italian",
  "japanese",
  "korean",
  "latin",
  "latino",
  "motown",
  "russian",
  "spanish",
  "turkish",
]);

/** Has letters and none of them lowercase: "R&B", the "K" of "K-Pop". */
const isAbbreviation = (word: string) => word !== word.toLowerCase() && word === word.toUpperCase();

/**
 * A genre as it reads mid-sentence: lowercased ("pop", "hip-hop/rap",
 * "singer/songwriter"), unless any word is an abbreviation ("R&B", the "K" of
 * "K-Pop") or a proper noun ("Latin", "Christian"); then Apple's spelling is
 * kept whole ("R&B/Soul", "K-Pop", "Christian & Gospel").
 */
export function genreInSentence(genre: string): string {
  const name = genre.trim();
  const words = name.split(/[\s/&-]+/).filter(Boolean);
  const keep = words.some((w) => isAbbreviation(w) || GENRE_PROPER_WORDS.has(w.toLowerCase()));
  return keep ? name : name.toLowerCase();
}

/** "pop", "pop and rock", "pop, rock and jazz" */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The leaders' share of the whole from which they're "mostly" rather than "most often". */
const MOSTLY_SHARE = 0.5;

/**
 * Who leads a ranking (most first), if anyone clearly does: the top one when
 * it's ahead of the rest, joined by the runner-up when that has at least 2,
 * at least half the leader's count, and is itself ahead of third; or the top
 * two when they tie at 2 or more ahead of third. Null when three or more tie
 * at the top (or everything appears once): nobody leads.
 */
function leaders<T extends { count: number }>(ranked: readonly T[]): T[] | null {
  const [a, b, c] = ranked;
  if (!a) return null;
  const bc = b?.count ?? 0;
  const cc = c?.count ?? 0;
  if (a.count > bc) return b && bc >= 2 && bc * 2 >= a.count && bc > cc ? [a, b] : [a];
  if (a.count >= 2 && bc > cc) return [a, b];
  return null;
}

/**
 * The genres headline, from genres ranked most first (one count per moment):
 * - one genre on every moment: "All pop";
 * - clear leaders (see `leaders`) on half the moments or more: "Mostly pop",
 *   "Mostly pop and hip-hop/rap"; under half: "Most often pop and rock";
 * - nobody leads: "A mix of pop, rock and jazz" (the first three, "… and
 *   more" when there are others).
 * Null under RESONATES_MIN_MOMENTS moments with a genre.
 */
export function genreHeadline(genres: readonly Ranked[]): string | null {
  const total = genres.reduce((n, g) => n + g.count, 0);
  if (total < RESONATES_MIN_MOMENTS) return null;
  const say = (g: Ranked) => genreInSentence(g.value);
  const lead = leaders(genres);
  if (!lead) {
    const names = genres.slice(0, 3).map(say);
    return genres.length > 3 ? `A mix of ${names.join(", ")} and more` : `A mix of ${listed(names)}`;
  }
  const covered = lead.reduce((n, g) => n + g.count, 0);
  if (lead.length === 1 && covered === total) return `All ${say(lead[0])}`;
  return `${covered / total >= MOSTLY_SHARE ? "Mostly" : "Most often"} ${listed(lead.map(say))}`;
}

export interface RankedDecade {
  /** The decade's first year: 1970 for the 1970s. */
  decade: number;
  count: number;
}

/**
 * A decade mid-sentence: "the 70s" from 1930 to 1990, otherwise in full
 * ("the 2010s", "the 1920s"), so there's no "the 10s" or "the 20s" to misread.
 */
export function decadeInSentence(decade: number): string {
  return decade >= 1930 && decade <= 1990 ? `the ${String(decade).slice(2)}s` : `the ${decade}s`;
}

/** A runner-up decade is a "soft spot" from this share of the moments with a release year. */
const SOFT_SPOT_SHARE = 0.2;

/**
 * The musical-periods headline, from decades ranked most first:
 * - every song from one decade: "All from the 2010s";
 * - one decade ahead of the rest: "Mostly the 2010s" (half or more) or "Most
 *   often the 2010s", plus ", with a soft spot for the 70s" when the
 *   runner-up has at least 2 moments and a fifth of them, ahead of third;
 * - two decades tied at the top (2 or more each, ahead of third): "Equally
 *   the 70s and the 2010s", oldest first;
 * - nobody leads: the span, "From the 60s to the 2020s".
 * Null under RESONATES_MIN_MOMENTS moments with a release year.
 */
export function periodHeadline(decades: readonly RankedDecade[]): string | null {
  const total = decades.reduce((n, d) => n + d.count, 0);
  if (total < RESONATES_MIN_MOMENTS) return null;
  const [a, b, c] = decades;
  const bc = b?.count ?? 0;
  const cc = c?.count ?? 0;
  if (a.count === total) return `All from ${decadeInSentence(a.decade)}`;
  if (a.count > bc) {
    const lead = `${a.count / total >= MOSTLY_SHARE ? "Mostly" : "Most often"} ${decadeInSentence(a.decade)}`;
    const soft = bc >= 2 && bc >= total * SOFT_SPOT_SHARE && bc > cc;
    return soft ? `${lead}, with a soft spot for ${decadeInSentence(b.decade)}` : lead;
  }
  if (a.count >= 2 && bc > cc) {
    const [older, newer] = [a.decade, b.decade].sort((x, y) => x - y);
    return `Equally ${decadeInSentence(older)} and ${decadeInSentence(newer)}`;
  }
  const years = decades.map((d) => d.decade);
  return `From ${decadeInSentence(Math.min(...years))} to ${decadeInSentence(Math.max(...years))}`;
}

/**
 * A saved genre as Insights counts it: Apple's spelling with aliases folded
 * ("Hip-Hop" → "Hip-Hop/Rap"); null for none, or Apple's catch-all "Music".
 */
export function genreOf(raw: string | null | undefined): string | null {
  const g = raw?.trim();
  if (!g || GENRE_IGNORED.has(g.toLowerCase())) return null;
  return GENRE_ALIASES[g.toLowerCase()] ?? g;
}

/** A release date's decade (1990 for 1994-…), or null when there's no plausible year. */
export function decadeOf(releaseDate: string | null | undefined, maxYear: number = new Date().getFullYear() + 1): number | null {
  const year = Number(/^(\d{4})-/.exec(releaseDate ?? "")?.[1]);
  return year >= 1900 && year <= maxYear ? Math.floor(year / 10) * 10 : null;
}

export interface Resonates {
  genreLine: string | null;
  /** Genres most first (`value` as Apple writes it, aliases folded); empty without a genre line. */
  genres: Ranked[];
  periodLine: string | null;
  /** Release decades most first; empty without a period line. */
  decades: RankedDecade[];
}

/**
 * "What resonates": the genres and release decades of the songs written
 * about, one count per moment. A moment without a genre or release date just
 * doesn't count toward that half, and each half needs RESONATES_MIN_MOMENTS.
 * Null when neither half has anything to say. `meta` newest first, so ties
 * rank the most recent first.
 */
export function resonates(
  meta: readonly Pick<InsightMoment, "songGenre" | "songReleaseDate">[],
  now: Date = new Date()
): Resonates | null {
  const genres = new Map<string, Ranked>();
  const decades = new Map<number, RankedDecade>();
  const maxYear = now.getFullYear() + 1;

  for (const m of meta) {
    const genre = genreOf(m.songGenre);
    if (genre) {
      const key = genre.toLowerCase();
      const entry = genres.get(key);
      if (entry) entry.count += 1;
      else genres.set(key, { value: genre, count: 1 });
    }

    const decade = decadeOf(m.songReleaseDate, maxYear);
    if (decade !== null) {
      const entry = decades.get(decade);
      if (entry) entry.count += 1;
      else decades.set(decade, { decade, count: 1 });
    }
  }

  const rankedGenres = rank(genres);
  // Stable sort: ties keep first-seen, i.e. most recent first.
  const rankedDecades = [...decades.values()].sort((a, b) => b.count - a.count);
  const genreLine = genreHeadline(rankedGenres);
  const periodLine = periodHeadline(rankedDecades);
  if (!genreLine && !periodLine) return null;
  return {
    genreLine,
    genres: genreLine ? rankedGenres : [],
    periodLine,
    decades: periodLine ? rankedDecades : [],
  };
}

// ---------------------------------------------------------------------------
// When you write: patterns, never absence
// ---------------------------------------------------------------------------

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

const TIMES: readonly TimeOfDay[] = ["morning", "afternoon", "evening", "night"];
const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Late night",
};
const TIME_PHRASE: Record<TimeOfDay, string> = {
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
  night: "late at night",
};

/** A saved time_of_day ("Late Night", "evening") as one of the four times; null for anything else. */
export function normalizeTimeOfDay(value: string | null | undefined): TimeOfDay | null {
  const v = value?.trim().toLowerCase();
  if (v === "morning" || v === "afternoon" || v === "evening") return v;
  if (v === "late night" || v === "night") return "night";
  return null;
}

/** A time-of-day claim needs this many moments with a time... */
export const TIME_MIN_MOMENTS = 5;
/** ...a weekday claim this many dated moments... */
export const WEEKDAY_MIN_MOMENTS = 7;
/** ...and a busiest month this many dated moments, spanning at least a year. */
export const MONTH_MIN_MOMENTS = 12;

/** A leader needs at least this many moments and this many times the runner-up's... */
const CLAIM_MIN_COUNT = 3;
const CLAIM_MARGIN = 1.5;
/** ...and this share: four times of day (even is 25%), seven days (14%), twelve months (8%). */
const TIME_SHARE = 0.4;
const WEEKDAY_SHARE = 0.25;
const WEEKEND_SHARE = 0.5;
const MONTH_SHARE = 0.2;

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The index of the bucket that clearly leads (the constants above), or null. */
function clearLeader(counts: readonly number[], share: number): number | null {
  const total = counts.reduce((n, c) => n + c, 0);
  if (total === 0) return null;
  let top = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[top]) top = i;
  const second = Math.max(0, ...counts.filter((_, i) => i !== top));
  const lead = counts[top];
  return lead >= CLAIM_MIN_COUNT && lead / total >= share && lead >= second * CLAIM_MARGIN ? top : null;
}

/** A "YYYY-MM-DD" day as a UTC timestamp with its month and weekday; null if it isn't one. */
function parseDay(d: string | null | undefined): { utc: number; month: number; weekday: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "");
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(m[2]) - 1) return null;
  return { utc: date.getTime(), month: date.getUTCMonth(), weekday: date.getUTCDay() };
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface WritingPattern {
  /** "Mostly in the evening, often on Sundays"; null when nothing stands out. */
  line: string | null;
  /** "November", when one month clearly leads across a year or more; else null. */
  busiestMonth: string | null;
  /** Moments per time of day, morning to late night, only the times used; empty under TIME_MIN_MOMENTS. */
  times: { value: TimeOfDay; label: string; count: number }[];
}

/**
 * "When you write", as patterns that hold by a clear margin, never absence.
 * The time of day is when the moment was written (saved); the weekday and
 * month are of the day it happened (`momentDate`).
 *
 * The line joins up to two claims:
 * - time: one time of day with 40%+ of the moments, at least 3, and 1.5× the
 *   next ("Mostly in the evening"); when none leads but 3+ times are used,
 *   "All through the day";
 * - day: one weekday with 25%+, at least 3, and 1.5× the next ("often on
 *   Sundays"); failing that, Saturdays and Sundays with half together
 *   ("often on weekends").
 * So "Mostly in the evening, often on Sundays", "Often on weekends", or null.
 * Busiest month: 20%+, at least 3, 1.5× the next. Null overall when there's
 * no line and no busiest month.
 */
export function writingPattern(
  meta: readonly Pick<InsightMoment, "momentDate" | "timeOfDay">[]
): WritingPattern | null {
  const timeCounts = TIMES.map(() => 0);
  const dayCounts = WEEKDAYS.map(() => 0);
  const monthCounts = MONTHS.map(() => 0);
  let oldest = Infinity;
  let newest = -Infinity;
  let dated = 0;

  for (const m of meta) {
    const t = normalizeTimeOfDay(m.timeOfDay);
    if (t) timeCounts[TIMES.indexOf(t)] += 1;
    const day = parseDay(m.momentDate);
    if (day) {
      dated += 1;
      dayCounts[day.weekday] += 1;
      monthCounts[day.month] += 1;
      oldest = Math.min(oldest, day.utc);
      newest = Math.max(newest, day.utc);
    }
  }

  const timed = timeCounts.reduce((n, c) => n + c, 0);
  let timeClaim: string | null = null;
  if (timed >= TIME_MIN_MOMENTS) {
    const lead = clearLeader(timeCounts, TIME_SHARE);
    if (lead !== null) timeClaim = `mostly ${TIME_PHRASE[TIMES[lead]]}`;
    else if (timeCounts.filter((c) => c > 0).length >= 3) timeClaim = "all through the day";
  }

  let dayClaim: string | null = null;
  if (dated >= WEEKDAY_MIN_MOMENTS) {
    const lead = clearLeader(dayCounts, WEEKDAY_SHARE);
    if (lead !== null) dayClaim = `often on ${WEEKDAYS[lead]}`;
    else if ((dayCounts[0] + dayCounts[6]) / dated >= WEEKEND_SHARE) dayClaim = "often on weekends";
  }

  let busiestMonth: string | null = null;
  if (dated >= MONTH_MIN_MOMENTS && newest - oldest >= YEAR_MS) {
    const lead = clearLeader(monthCounts, MONTH_SHARE);
    if (lead !== null) busiestMonth = MONTHS[lead];
  }

  const joined = [timeClaim, dayClaim].filter(Boolean).join(", ");
  const line = joined ? joined[0].toUpperCase() + joined.slice(1) : null;
  if (!line && !busiestMonth) return null;

  return {
    line,
    busiestMonth,
    times:
      timed >= TIME_MIN_MOMENTS
        ? TIMES.map((value, i) => ({ value, label: TIME_LABEL[value], count: timeCounts[i] })).filter(
            (t) => t.count > 0
          )
        : [],
  };
}

// ---------------------------------------------------------------------------
// Tapping through: the moments behind a genre, a decade or a time of day
// ---------------------------------------------------------------------------

export type InsightKind = "genre" | "decade" | "time";

export interface InsightGroup {
  /** What the route carries: the genre as counted, "1990", or "evening". */
  key: string;
  /** "Pop", "1990s", "Evening". */
  label: string;
  momentIds: string[];
}

/** The decade's label everywhere outside a sentence: "1990s". */
export const decadeLabel = (decade: number) => `${decade}s`;

/**
 * Every genre, decade or time of day in the journal with the moments in it,
 * most first (ties most recent first, as `meta` comes newest first). Counted
 * exactly as Insights counts them (genreOf, decadeOf, normalizeTimeOfDay), so
 * a row's number and the screen it opens always agree. Times run morning to
 * late night instead, like the rows in When you write.
 */
export function insightGroups(
  meta: readonly (Pick<InsightMoment, "songGenre" | "songReleaseDate" | "timeOfDay"> & { id: string })[],
  kind: InsightKind,
  now: Date = new Date()
): InsightGroup[] {
  const groups = new Map<string, InsightGroup>();
  const maxYear = now.getFullYear() + 1;
  for (const m of meta) {
    let key: string | null = null;
    let label = "";
    if (kind === "genre") {
      const g = genreOf(m.songGenre);
      if (g) [key, label] = [g.toLowerCase(), g];
    } else if (kind === "decade") {
      const d = decadeOf(m.songReleaseDate, maxYear);
      if (d !== null) [key, label] = [String(d), decadeLabel(d)];
    } else {
      const t = normalizeTimeOfDay(m.timeOfDay);
      if (t) [key, label] = [t, TIME_LABEL[t]];
    }
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.momentIds.push(m.id);
    else groups.set(key, { key, label, momentIds: [m.id] });
  }
  const list = [...groups.values()];
  if (kind === "time") return list.sort((a, b) => TIMES.indexOf(a.key as TimeOfDay) - TIMES.indexOf(b.key as TimeOfDay));
  return list.sort((a, b) => b.momentIds.length - a.momentIds.length);
}

/** The route key for a genre as Insights shows it ("Hip-Hop/Rap" → "hip-hop/rap"). */
export const genreKey = (genre: string) => genre.toLowerCase();
