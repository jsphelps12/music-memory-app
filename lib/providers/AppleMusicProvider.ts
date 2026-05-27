// Type-only imports are erased at compile time — safe regardless of native availability
import type { ISong, IPlaybackState } from "@lomray/react-native-apple-music";
import {
  requestMusicAuthorization,
  searchSongs as searchAppleMusic,
  playAppleMusic,
  fetchPreviewUrl as fetchItunesPreviewUrl,
} from "@/lib/musickit";
import type { Song } from "@/types";
import type { MusicProvider, PlaybackState } from "./MusicProvider";

// Lazy require — defers native module access until first use so a missing or
// misconfigured Apple Music SDK doesn't crash the app on startup.
function getAMSdk(): typeof import("@lomray/react-native-apple-music") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@lomray/react-native-apple-music");
  } catch {
    return null;
  }
}

export class AppleMusicProvider implements MusicProvider {
  readonly type = "apple_music" as const;

  async isAvailable(): Promise<boolean> {
    return requestMusicAuthorization();
  }

  async authorize(): Promise<boolean> {
    return requestMusicAuthorization();
  }

  async search(query: string): Promise<Song[]> {
    const results = await searchAppleMusic(query);
    return results.map((s) => ({
      ...s,
      provider: "apple_music" as const,
      spotifyId: null,
    }));
  }

  async lookupById(id: string): Promise<Song | null> {
    try {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
      const json = await response.json();
      const result = json.results?.[0];
      if (!result?.trackId) return null;
      return {
        id: String(result.trackId),
        title: result.trackName ?? "",
        artistName: result.artistName ?? "",
        albumName: result.collectionName ?? "",
        artworkUrl: result.artworkUrl100?.replace("100x100", "600x600") ?? "",
        provider: "apple_music",
        appleMusicId: String(result.trackId),
        spotifyId: null,
        durationMs: result.trackTimeMillis ?? 0,
      };
    } catch {
      return null;
    }
  }

  async play(song: Song): Promise<void> {
    if (!song.appleMusicId) throw new Error("apple_music_no_id");
    await playAppleMusic(song.appleMusicId);
  }

  pause(): void {
    try { getAMSdk()?.Player.pause(); } catch {}
  }

  resume(): void {
    try { getAMSdk()?.Player.play(); } catch {}
  }

  stop(): void {
    try { getAMSdk()?.Player.pause(); } catch {}
  }

  seekTo(seconds: number): void {
    try { getAMSdk()?.Player.seekToTime(seconds); } catch {}
  }

  async fetchPreviewUrl(song: Song): Promise<string | null> {
    if (!song.appleMusicId) return null;
    const { previewUrl } = await fetchItunesPreviewUrl(song.appleMusicId);
    return previewUrl;
  }

  onStateChange(cb: (state: PlaybackState) => void): () => void {
    const sdk = getAMSdk();
    if (!sdk) return () => {};

    const { Player, PlaybackStatus } = sdk;

    const stateSub = Player.addListener("onPlaybackStateChange", (state: IPlaybackState) => {
      const isPlaying =
        state.playbackStatus === PlaybackStatus.PLAYING ||
        state.playbackStatus === PlaybackStatus.SEEKING_FORWARD ||
        state.playbackStatus === PlaybackStatus.SEEKING_BACKWARD;
      cb({
        isPlaying,
        positionMs: (state.playbackTime ?? 0) * 1000,
        durationMs: 0,
      });
    });

    const timeSub = Player.addListener("onPlaybackTimeUpdate", (data: any) => {
      cb({ isPlaying: true, positionMs: (data.playbackTime ?? 0) * 1000, durationMs: 0 });
    });

    const songSub = Player.addListener("onCurrentSongChange", (song: ISong) => {
      cb({ isPlaying: true, positionMs: 0, durationMs: (song.duration ?? 0) * 1000 });
    });

    return () => {
      stateSub.remove();
      timeSub.remove();
      songSub.remove();
    };
  }
}
