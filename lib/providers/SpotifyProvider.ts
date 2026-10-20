import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { rankSongResults } from "@/lib/musicSearch";
import type { Song } from "@/types";
import type { MusicProvider, PlaybackState } from "./MusicProvider";
import { SpotifyRemote } from "@/modules/spotify-remote";
import { findItunesPreview } from "@/lib/itunes";
import {
  SpotifyError,
  spotifyFailureFromStatus,
  withTimeout,
  type SpotifyFailure,
} from "./spotifyErrors";

export type SpotifyConnectResult =
  | { ok: true; premium: boolean }
  | { ok: false; reason: SpotifyFailure };

// The App Remote SDK can wait indefinitely (Spotify app missing, stuck
// launching). Nothing the user tapped should spin forever.
const CONNECT_TIMEOUT_MS = 15_000;
const PLAY_TIMEOUT_MS = 10_000;
const API = "https://api.spotify.com/v1";

const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
// Must match the per-variant scheme in app.config.ts, and each variant's
// redirect URI must be whitelisted in the Spotify developer dashboard.
const REDIRECT_URL =
  process.env.EXPO_PUBLIC_APP_ENV === "preview"
    ? "soundtracks-beta://spotify-callback"
    : "soundtracks://spotify-callback";
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
  // For /me's `product` field: tells us up front whether full playback can
  // work (Premium) or the user will get previews only.
  "user-read-private",
];

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  // expo-crypto, not the global: Hermes has no Web Crypto `crypto` object.
  const randomBytes = Crypto.getRandomValues(new Uint8Array(64));
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
    return (await this.connect()).ok;
  }

  /**
   * Sign in (reusing a live session if there is one) and prove the account can
   * actually use the Web API before anyone relies on it. A dev-mode Spotify app
   * lets ANY account finish OAuth, then 403s every API call for accounts not on
   * its allowlist, so "signed in" alone would switch people onto a provider
   * whose search silently returns nothing.
   */
  async connect(): Promise<SpotifyConnectResult> {
    try {
      let token = await this._getValidToken();
      if (!token) {
        const signedIn = await this._signIn();
        if (!signedIn.ok) return signedIn;
        token = await this._getValidToken();
        if (!token) return { ok: false, reason: "failed" };
      }
      return await this._verifyAccount(token);
    } catch (e) {
      return { ok: false, reason: e instanceof SpotifyError ? e.reason : "failed" };
    }
  }

  async clearTokens(): Promise<void> {
    await Promise.all(
      [STORE_ACCESS_TOKEN, STORE_REFRESH_TOKEN, STORE_EXPIRY].map((k) =>
        SecureStore.deleteItemAsync(k).catch(() => {})
      )
    );
  }

  private async _signIn(): Promise<{ ok: true } | { ok: false; reason: SpotifyFailure }> {
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
    if (result.type === "cancel" || result.type === "dismiss") return { ok: false, reason: "cancelled" };
    if (result.type !== "success") return { ok: false, reason: "failed" };

    const url = new URL(result.url);
    // Tapping "Cancel" on Spotify's consent page comes back as error=access_denied.
    if (url.searchParams.get("error") === "access_denied") return { ok: false, reason: "cancelled" };
    const code = url.searchParams.get("code");
    if (!code) return { ok: false, reason: "failed" };

    await this._exchangeCode(code, verifier);
    return { ok: true };
  }

  private async _verifyAccount(token: string): Promise<SpotifyConnectResult> {
    let res: Response;
    try {
      res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      throw new SpotifyError("network", { cause: e });
    }
    if (!res.ok) {
      const reason = spotifyFailureFromStatus(res.status);
      // A token that can't call the API is worse than none: it makes
      // isAvailable() say yes. Drop it unless the failure is transient.
      if (reason !== "network") await this.clearTokens();
      return { ok: false, reason };
    }
    const me = await res.json().catch(() => ({}));
    return { ok: true, premium: me?.product === "premium" };
  }

  private async _exchangeCode(code: string, verifier: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(SPOTIFY_TOKEN_URL, {
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
    } catch (e) {
      throw new SpotifyError("network", { cause: e });
    }
    if (!res.ok) throw new SpotifyError(spotifyFailureFromStatus(res.status) === "network" ? "network" : "failed");
    const stored = await this._storeTokenResponse(await res.json());
    if (!stored) throw new SpotifyError("failed");
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
      if (!res.ok) {
        // 400 invalid_grant = revoked or expired for good. Forget it so we stop
        // retrying a dead token and report "signed out" from here on. Keep it
        // on 429/5xx: those are Spotify's problem and pass.
        if (res.status === 400 || res.status === 401) await this.clearTokens();
        return null;
      }
      const json = await res.json();
      const ok = await this._storeTokenResponse(json);
      return ok ? (json.access_token as string) : null;
    } catch {
      return null;
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  /**
   * Throws SpotifyError on failure: "no results" and "couldn't search" must
   * not look the same, or a broken connection reads as an empty catalog.
   */
  async search(query: string): Promise<Song[]> {
    if (!query.trim()) return [];
    const token = await this._getValidToken();
    if (!token) throw new SpotifyError("signed_out");
    let res: Response;
    try {
      res = await fetch(
        `${API}/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      throw new SpotifyError("network", { cause: e });
    }
    if (!res.ok) {
      const reason = spotifyFailureFromStatus(res.status);
      if (reason === "signed_out" || reason === "not_registered") await this.clearTokens();
      throw new SpotifyError(reason);
    }
    const json = await res.json();
    return rankSongResults(
      query,
      (json.tracks?.items ?? []).map((track: any) => this._trackToSong(track))
    );
  }

  async lookupById(spotifyId: string): Promise<Song | null> {
    const token = await this._getValidToken();
    if (!token) return null;
    try {
      const res = await fetch(
        `${API}/tracks/${spotifyId}`,
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

    if (!SpotifyRemote.isAvailable) throw new SpotifyError("unavailable");
    const token = await this._getValidToken();
    if (!token) throw new SpotifyError("signed_out");

    if (!SpotifyRemote.isConnected()) {
      const connected = await withTimeout(
        SpotifyRemote.connect(SPOTIFY_CLIENT_ID, REDIRECT_URL, token),
        CONNECT_TIMEOUT_MS
      );
      if (!connected) throw new SpotifyError("failed");
    }

    await withTimeout(SpotifyRemote.playUri(`spotify:track:${song.spotifyId}`), PLAY_TIMEOUT_MS);
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

  /**
   * Spotify's own preview_url first; it is null for apps created after
   * Spotify's late-2024 API change, so in practice the iTunes recording of the
   * same song supplies it. Never throws, and needs no Spotify session, so it
   * also works for recipients who have never connected Spotify.
   */
  async fetchPreviewUrl(song: Song): Promise<string | null> {
    if (song.spotifyId) {
      try {
        const token = await this._getValidToken();
        if (token) {
          const res = await fetch(`${API}/tracks/${song.spotifyId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json.preview_url) return json.preview_url as string;
          }
        }
      } catch {
        // fall through to iTunes
      }
    }
    return findItunesPreview(song.title, song.artistName);
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
