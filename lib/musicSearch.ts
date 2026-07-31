import { FavoriteArtist, FavoriteSong } from "@/types";

/** Lowercase and strip diacritics so "Atardecér" matches "atardecer". */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Re-rank provider search results so typed-title matches surface first.
 *
 * Both Apple Music and Spotify return popularity-weighted catalog order — the
 * Apple Music app adds its own "Top Results" layer that the catalog API does
 * not expose, which is how an exact title like "otro atardecer" ends up 10th.
 * Exact title match ranks first, then title-prefix, then the provider's
 * original order (stable within each tier).
 */
export function rankSongResults<T extends { title: string }>(
  query: string,
  songs: T[]
): T[] {
  const q = normalizeForMatch(query);
  if (!q) return songs;

  const tier = (title: string): number => {
    const t = normalizeForMatch(title);
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    return 2;
  };

  return songs
    .map((song, index) => ({ song, index, tier: tier(song.title) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(({ song }) => song);
}

export async function searchItunesArtists(query: string): Promise<FavoriteArtist[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10`
    );
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: String(r.artistId),
      name: r.artistName,
      artworkUrl: null,
    }));
  } catch {
    return [];
  }
}

export async function searchItunesSongs(query: string): Promise<FavoriteSong[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`
    );
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      artworkUrl: r.artworkUrl100?.replace("100x100", "200x200") ?? null,
    }));
  } catch {
    return [];
  }
}
