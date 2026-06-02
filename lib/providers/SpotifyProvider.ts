import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import type { Song } from "@/types";
import type { MusicProvider, PlaybackState } from "./MusicProvider";
import { SpotifyRemote } from "@/modules/spotify-remote";

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URL = "soundtracks://spotify-callback";
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const STORE_ACCESS_TOKEN = "spotify_access_token";
const STORE_REFRESH_TOKEN = "spotify_refresh_token";
const STORE_EXPIRY = "spotify_token_expiry";

const SCOPES = [
  "app-remote-control",
  "streaming",
  "user-read-playback-state",
  "user-read-currently-playing",
];

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (b) => chars[b % chars.length]).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  // Base64url encode: + → - / → _ strip trailing =
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SpotifyProvider implements MusicProvider {
  readonly type = "spotify" as const;

  // ─── Authorization ──────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const token = await this._getValidToken();
      return token !== null;
    } catch {
      return false;
    }
  }

  async authorize(): Promise<boolean> {
    // Re-use valid token if we have one
    const existing = await this._getValidToken();
    if (existing) return true;

    try {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      const params = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URL,
        scope: SCOPES.join(" "),
        code_challenge_method: "S256",
        code_challenge: challenge,
        show_dialog: "false",
      });

      const result = await WebBrowser.openAuthSessionAsync(
        `${SPOTIFY_AUTH_URL}?${params.toString()}`,
        REDIRECT_URL
      );

      if (result.type !== "success") return false;

      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (!code) return false;

      return this._exchangeCode(code, verifier);
    } catch {
      return false;
    }
  }

  private async _exchangeCode(code: string, verifier: string): Promise<boolean> {
    try {
      const res = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URL,
          client_id: SPOTIFY_CLIENT_ID,
          code_verifier: verifier,
        }).toString(),
      });
      if (!res.ok) return false;
      return this._storeTokenResponse(await res.json());
    } catch {
      return false;
    }
  }

  private async _storeTokenResponse(json: Record<string, unknown>): Promise<boolean> {
    const accessToken = json.access_token as string | undefined;
    if (!accessToken) return false;
    await SecureStore.setItemAsync(STORE_ACCESS_TOKEN, accessToken);
    if (json.refresh_token) {
      await SecureStore.setItemAsync(STORE_REFRESH_TOKEN, json.refresh_token as string);
    }
    const expiry = Date.now() + ((json.expires_in as number ?? 3600) * 1000);
    await SecureStore.setItemAsync(STORE_EXPIRY, String(expiry));
    return true;
  }

  private async _getValidToken(): Promise<string | null> {
    const token = await SecureStore.getItemAsync(STORE_ACCESS_TOKEN);
    const expiry = await SecureStore.getItemAsync(STORE_EXPIRY);
    if (!token) return null;
    // Expired or within 2 minutes → try refresh
    if (expiry && Date.now() > Number(expiry) - 120_000) {
      return this._refreshToken();
    }
    return token;
  }

  private async _refreshToken(): Promise<string | null> {
    const refreshToken = await SecureStore.getItemAsync(STORE_REFRESH_TOKEN);
    if (!refreshToken) return null;
    try {
      const res = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: SPOTIFY_CLIENT_ID,
        }).toString(),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const ok = await this._storeTokenResponse(json);
      return ok ? (json.access_token as string) : null;
    } catch {
      return null;
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

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

  // ─── Playback ─────────────────────────────────────────────────────────────────

  async play(song: Song): Promise<void> {
    if (!song.spotifyId) throw new Error("spotify_no_id");

    const token = await this._getValidToken();
    if (!token) throw new Error("spotify_not_authorized");

    if (!SpotifyRemote.isConnected()) {
      const connected = await SpotifyRemote.connect(SPOTIFY_CLIENT_ID, REDIRECT_URL, token);
      if (!connected) throw new Error("spotify_connect_failed");
    }

    await SpotifyRemote.playUri(`spotify:track:${song.spotifyId}`);
  }

  pause(): void {
    SpotifyRemote.pause();
  }

  resume(): void {
    SpotifyRemote.resume();
  }

  stop(): void {
    SpotifyRemote.pause();
    SpotifyRemote.disconnect();
  }

  seekTo(seconds: number): void {
    SpotifyRemote.seekTo(seconds * 1000);
  }

  // ─── Preview URL ──────────────────────────────────────────────────────────────

  async fetchPreviewUrl(song: Song): Promise<string | null> {
    if (!song.spotifyId) return null;
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

  // ─── State Events ─────────────────────────────────────────────────────────────

  onStateChange(cb: (state: PlaybackState) => void): () => void {
    const sub = SpotifyRemote.addStateListener((state) => {
      cb({
        isPlaying: state.isPlaying,
        positionMs: state.positionMs,
        durationMs: state.durationMs,
      });
    });
    return () => sub.remove();
  }
}
