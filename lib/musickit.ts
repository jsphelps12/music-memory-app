import {
  Auth,
  MusicKit,
  CatalogSearchType,
} from "@lomray/react-native-apple-music";
import type { ISong } from "@lomray/react-native-apple-music";
import { Song } from "@/types";

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
