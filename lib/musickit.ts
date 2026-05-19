import {
  Auth,
  MusicKit,
  Player,
  MusicItem,
  CatalogSearchType,
} from "@lomray/react-native-apple-music";
import type { ISong, ITracksFromLibrary } from "@lomray/react-native-apple-music";
import type { Song } from "@/types";

export async function requestMusicAuthorization(): Promise<boolean> {
  const status = await Auth.authorize();
  return status === "authorized";
}

export async function searchSongs(query: string): Promise<Song[]> {
  if (!query.trim()) return [];

  const result = await MusicKit.catalogSearch(query, [
    CatalogSearchType.SONGS,
  ]);
  const songs: ISong[] = result?.songs ?? [];

  return songs.map((item) => ({
    id: item.id,
    title: item.title,
    artistName: item.artistName,
    albumName: "",
    artworkUrl: item.artworkUrl ?? "",
    appleMusicId: item.id,
    durationMs: item.duration ?? 0,
  }));
}

export async function playAppleMusic(appleMusicId: string): Promise<void> {
  await MusicKit.setPlaybackQueue(appleMusicId, MusicItem.SONG);
  Player.play();
}

export async function getRecentlyPlayed(): Promise<{ id: string; title: string; artist: string }[]> {
  const result: ITracksFromLibrary = await MusicKit.getTracksFromLibrary();
  return result.recentlyPlayedItems
    .filter((t) => t.type === MusicItem.SONG)
    .map((t) => ({ id: String(t.id), title: t.title, artist: t.subtitle }));
}

export async function fetchPreviewUrl(
  appleMusicId: string
): Promise<{ previewUrl: string | null; albumName: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${appleMusicId}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const json = await response.json();
    const result = json.results?.[0];
    return {
      previewUrl: result?.previewUrl ?? null,
      albumName: result?.collectionName ?? null,
    };
  } catch {
    return { previewUrl: null, albumName: null };
  }
}
