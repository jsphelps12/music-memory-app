// The You screen's numbers, from the browse metadata it already loads (one row
// per moment). Pure; tested in lib/__tests__/profileStats.test.ts.
//
// Deliberately no streaks: they count the days you didn't write, the same
// absence the app stopped nagging about (CLAUDE.md, Notifications).

export interface StatMoment {
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
}

export interface ProfileStats {
  moments: number;
  songs: number;
  artists: number;
  /** Distinct calendar days with at least one moment. */
  days: number;
  /** The artist with the most moments (ties: whoever reached it first), or null. */
  topArtist: { name: string; count: number } | null;
}

const norm = (s: string) => s.trim().toLowerCase();

export function profileStats(meta: readonly StatMoment[]): ProfileStats {
  const songs = new Set<string>();
  const days = new Set<string>();
  const artistCounts = new Map<string, { name: string; count: number }>();

  for (const m of meta) {
    const artist = m.songArtist?.trim() ?? "";
    const title = m.songTitle?.trim() ?? "";
    if (title) songs.add(`${norm(title)}\u0000${norm(artist)}`);
    if (m.momentDate) days.add(m.momentDate.slice(0, 10));
    if (artist) {
      const key = norm(artist);
      const entry = artistCounts.get(key);
      if (entry) entry.count += 1;
      else artistCounts.set(key, { name: artist, count: 1 });
    }
  }

  let topArtist: ProfileStats["topArtist"] = null;
  for (const entry of artistCounts.values()) {
    if (!topArtist || entry.count > topArtist.count) topArtist = { ...entry };
  }

  return {
    moments: meta.length,
    songs: songs.size,
    artists: artistCounts.size,
    days: days.size,
    topArtist,
  };
}
