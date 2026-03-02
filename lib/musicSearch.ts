import { FavoriteArtist, FavoriteSong } from "@/types";

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
