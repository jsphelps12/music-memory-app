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
