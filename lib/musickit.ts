import {
  Auth,
  MusicKit,
  Player,
  MusicItem,
  CatalogSearchType,
  PlaybackStatus,
} from "@lomray/react-native-apple-music";
import type { ISong, ITracksFromLibrary, IPlaybackState } from "@lomray/react-native-apple-music";

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
  const songs: (ISong & { albumName?: string })[] = result?.songs ?? [];

  return songs.map((item) => ({
    id: item.id,
    title: item.title,
    artistName: item.artistName,
    albumName: item.albumName ?? "",
    artworkUrl: item.artworkUrl ?? "",
    appleMusicId: item.id,
    durationMs: item.duration ?? 0,
  }));
}

export async function playAppleMusic(appleMusicId: string): Promise<number> {
  Player.pause();
  await MusicKit.setPlaybackQueue(appleMusicId, MusicItem.SONG);

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const done = (durationOrFail: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stateSub.remove();
      songSub.remove();
      if (durationOrFail < 0) { Player.pause(); reject(new Error("apple_music_playback_failed")); }
      else resolve(durationOrFail);
    };

    const timeout = setTimeout(() => done(-1), 2500);

    const stateSub = Player.addListener("onPlaybackStateChange", (state: IPlaybackState) => {
      if (state.playbackStatus === PlaybackStatus.PLAYING) {
        const playingId = state.currentSong?.id;
        if (playingId && playingId !== appleMusicId) {
          done(-1);
        } else {
          done(state.currentSong?.duration ?? 0);
        }
      } else if (
        state.playbackStatus === PlaybackStatus.STOPPED ||
        state.playbackStatus === PlaybackStatus.INTERRUPTED
      ) {
        done(-1);
      }
    });

    const songSub = Player.addListener("onCurrentSongChange", (song: ISong) => {
      if (song.id && song.id !== appleMusicId) {
        done(-1);
      } else {
        done(song.duration ?? 0);
      }
    });

    Player.play();
  });
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
