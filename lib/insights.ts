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
        artists.set(key, { name: artist, count: 1, artworkUrl: m.songArtworkUrl || null });
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
