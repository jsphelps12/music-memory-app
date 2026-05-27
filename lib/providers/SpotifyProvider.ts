// Type-only imports are erased at compile time — safe regardless of native availability
import type { SpotifySession } from "react-native-spotify-remote";
import type { PlayerState as SpotifyPlayerState } from "react-native-spotify-remote";
import * as SecureStore from "expo-secure-store";
import type { Song } from "@/types";
import type { MusicProvider, PlaybackState } from "./MusicProvider";

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URL = "soundtracks://spotify-callback";

const STORE_ACCESS_TOKEN = "spotify_access_token";
const STORE_EXPIRY = "spotify_token_expiry";

// Lazy require — defers native module access until first use so a missing or
// misconfigured Spotify SDK doesn't crash the app on startup.
function getSDK(): typeof import("react-native-spotify-remote") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("react-native-spotify-remote");
  } catch {
    return null;
  }
}

export class SpotifyProvider implements MusicProvider {
  readonly type = "spotify" as const;

  // ─── Authorization ────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const sdk = getSDK();
      if (!sdk) return false;
      const token = await this._getValidToken();
      if (!token) return false;
      return sdk.remote.isConnectedAsync();
    } catch {
      return false;
    }
  }

  async authorize(): Promise<boolean> {
    const sdk = getSDK();
    if (!sdk) return false;

    // Check stored token first — re-use if still valid
    const existing = await this._getValidToken();
    if (existing) {
      try {
        await sdk.remote.connect(existing);
        return true;
      } catch {
        // Token may be valid but app remote not yet connected — still authorized
        return true;
      }
    }

    try {
      const session: SpotifySession = await sdk.auth.authorize({
        clientID: SPOTIFY_CLIENT_ID,
        redirectURL: REDIRECT_URL,
        scopes: [
          sdk.ApiScope.AppRemoteControlScope,
          sdk.ApiScope.StreamingScope,
          sdk.ApiScope.UserReadPlaybackStateScope,
          sdk.ApiScope.UserReadCurrentlyPlayingScope,
        ],
        showDialog: false,
      });

      if (!session?.accessToken) return false;

      await SecureStore.setItemAsync(STORE_ACCESS_TOKEN, session.accessToken);
      const expiry = session.expirationDate
        ? new Date(session.expirationDate).getTime()
        : Date.now() + 3600_000;
      await SecureStore.setItemAsync(STORE_EXPIRY, String(expiry));

      return true;
    } catch {
      return false;
    }
  }

  private async _getValidToken(): Promise<string | null> {
    const token = await SecureStore.getItemAsync(STORE_ACCESS_TOKEN);
    const expiry = await SecureStore.getItemAsync(STORE_EXPIRY);
    if (!token) return null;
    // Treat as expired if within 2 minutes of expiry
    if (expiry && Date.now() > Number(expiry) - 120_000) return null;
    return token;
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  async search(query: string): Promise<Song[]> {
    if (!query.trim()) return [];
    const token = await this._getValidToken();
    if (!token) return [];

    try {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json.tracks?.items ?? []).map((track: any) => this._trackToSong(track));
    } catch {
      return [];
    }
  }

  async lookupById(spotifyId: string): Promise<Song | null> {
    const token = await this._getValidToken();
    if (!token) return null;

    try {
      const res = await fetch(
        `https://api.spotify.com/v1/tracks/${spotifyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      return this._trackToSong(await res.json());
    } catch {
      return null;
    }
  }

  private _trackToSong(track: any): Song {
    return {
      id: track.id,
      title: track.name ?? "",
      artistName: track.artists?.map((a: any) => a.name).join(", ") ?? "",
      albumName: track.album?.name ?? "",
      artworkUrl: track.album?.images?.[0]?.url ?? "",
      provider: "spotify",
      appleMusicId: null,
      spotifyId: track.id,
      durationMs: track.duration_ms ?? 0,
    };
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  async play(song: Song): Promise<void> {
    const sdk = getSDK();
    if (!sdk) throw new Error("spotify_sdk_unavailable");
    if (!song.spotifyId) throw new Error("spotify_no_id");

    const token = await this._getValidToken();
    if (!token) throw new Error("spotify_not_authorized");

    // Connect to Spotify App Remote (requires Spotify app + Premium)
    await sdk.remote.connect(token);
    await sdk.remote.playUri(`spotify:track:${song.spotifyId}`);
  }

  pause(): void {
    getSDK()?.remote.pause().catch(() => {});
  }

  resume(): void {
    getSDK()?.remote.resume().catch(() => {});
  }

  stop(): void {
    const sdk = getSDK();
    sdk?.remote.pause().catch(() => {});
    sdk?.remote.disconnect().catch(() => {});
  }

  seekTo(seconds: number): void {
    getSDK()?.remote.seek(seconds * 1000).catch(() => {});
  }

  // ─── Preview URL ──────────────────────────────────────────────────────────

  async fetchPreviewUrl(song: Song): Promise<string | null> {
    if (!song.spotifyId) return null;
    // Use the user's own OAuth token — no Edge Function or client credentials needed.
    // The /v1/tracks/{id} response includes preview_url directly.
    const token = await this._getValidToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/tracks/${song.spotifyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.preview_url ?? null;
    } catch {
      return null;
    }
  }

  // ─── State Events ─────────────────────────────────────────────────────────

  onStateChange(cb: (state: PlaybackState) => void): () => void {
    const sdk = getSDK();
    if (!sdk) return () => {};

    const listener = (state: SpotifyPlayerState) => {
      cb({
        isPlaying: !state.isPaused,
        positionMs: state.playbackPosition ?? 0,
        durationMs: state.track?.duration ?? 0,
      });
    };
    sdk.remote.addListener("playerStateChanged", listener);
    return () => sdk.remote.removeListener("playerStateChanged", listener);
  }
}
