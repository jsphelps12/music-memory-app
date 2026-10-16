import { AppleMusicProvider } from "./AppleMusicProvider";
import type { MusicProvider } from "./MusicProvider";
import type { MusicProviderType } from "@/types";
import { findItunesPreview } from "@/lib/itunes";
import { SpotifyError } from "./spotifyErrors";
import type { SpotifyConnectResult } from "./SpotifyProvider";

// NOTE: expo-secure-store must NOT be statically imported here (or anywhere
// reached at startup). Binaries built before June 2026 (incl. App Store build 7)
// don't contain the ExpoSecureStore pod, and its module factory throws at
// import time — a static import turns that into an instant startup crash on
// OTA update. It is only imported inside SpotifyProvider, behind the try/catch
// below. (The June "REACT-NATIVE-12" crash was actually caused by
// expo-secure-store@56 being incompatible with SDK 54, so the pod was silently
// never linked into any binary.)

export type { MusicProvider, PlaybackState } from "./MusicProvider";
export { AppleMusicProvider } from "./AppleMusicProvider";
export type { SpotifyConnectResult } from "./SpotifyProvider";
// SpotifyProvider is NOT re-exported here — it is require()'d dynamically in
// getProvider() below so the SpotifyRemote native module is never loaded at
// import time. A static re-export would defeat that lazy-load guard.

// Singletons — created lazily on first use.
// SpotifyProvider is require()'d dynamically so the native module is never
// touched at import time (prevents startup crash if SpotifyiOS fails to init).
let _apple: AppleMusicProvider | null = null;
let _spotify: SpotifyProviderInstance | null = null;
let _spotifyLoadFailed = false;

type SpotifyProviderInstance = import("./SpotifyProvider").SpotifyProvider;

function loadSpotify(): SpotifyProviderInstance | null {
  if (_spotify) return _spotify;
  if (_spotifyLoadFailed) return null;
  try {
    // Dynamic require keeps SpotifyRemote native module load deferred until
    // the first moment someone actually uses Spotify.
    const { SpotifyProvider } = require("./SpotifyProvider") as typeof import("./SpotifyProvider");
    _spotify = new SpotifyProvider();
    return _spotify;
  } catch {
    _spotifyLoadFailed = true;
    return null;
  }
}

/**
 * Stands in when the Spotify module can't load. getProvider() used to throw
 * here, and its callers include render (song search) and the save path, so a
 * load failure would have crashed a screen or failed a save. This fails each
 * call the way a disconnected Spotify would, and previews still resolve
 * through iTunes, so Spotify moments stay playable.
 */
const unavailableSpotify: MusicProvider = {
  type: "spotify",
  isAvailable: async () => false,
  authorize: async () => false,
  search: async () => {
    throw new SpotifyError("unavailable");
  },
  lookupById: async () => null,
  play: async () => {
    throw new SpotifyError("unavailable");
  },
  pause: () => {},
  resume: () => {},
  stop: () => {},
  seekTo: () => {},
  fetchPreviewUrl: (song) => findItunesPreview(song.title, song.artistName),
  onStateChange: () => () => {},
};

/** Never throws. */
export function getProvider(type: MusicProviderType): MusicProvider {
  if (type === "spotify") return loadSpotify() ?? unavailableSpotify;
  _apple ??= new AppleMusicProvider();
  return _apple;
}

/** Sign in to Spotify and verify the account can use it. Never throws. */
export async function connectSpotify(): Promise<SpotifyConnectResult> {
  const spotify = loadSpotify();
  if (!spotify) return { ok: false, reason: "unavailable" };
  return spotify.connect();
}

/** Forget the Spotify session (switching away, or after a hard failure). */
export async function disconnectSpotify(): Promise<void> {
  await loadSpotify()?.clearTokens();
}
