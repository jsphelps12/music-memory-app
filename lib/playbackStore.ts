// Which song is playing, as a tiny external store, so a list row can subscribe
// to "is MY song playing" and re-render only when that answer flips.
// contexts/PlayerContext.tsx owns the instance; pure, tested in
// lib/__tests__/playbackStore.test.ts.

import type { Song } from "@/types";

export interface PlaybackSnapshot {
  currentSong: Song | null;
  isPlaying: boolean;
}

export interface PlaybackStore {
  get(): PlaybackSnapshot;
  set(next: PlaybackSnapshot): void;
  subscribe(listener: () => void): () => void;
}

/**
 * The id a moment and the player both carry for a song: the provider-native
 * one (Spotify's, else Apple Music's), so both kinds of moment match.
 */
export function playbackSongId(
  song: { spotifyId?: string | null; appleMusicId?: string | null } | null | undefined
): string | null {
  return song?.spotifyId ?? song?.appleMusicId ?? null;
}

/** True while `songId` is the current song and it's playing (not paused). */
export function isSongPlaying(snapshot: PlaybackSnapshot, songId: string | null | undefined): boolean {
  return !!songId && snapshot.isPlaying && playbackSongId(snapshot.currentSong) === songId;
}

export function createPlaybackStore(): PlaybackStore {
  let snapshot: PlaybackSnapshot = { currentSong: null, isPlaying: false };
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set(next) {
      if (next.currentSong === snapshot.currentSong && next.isPlaying === snapshot.isPlaying) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
