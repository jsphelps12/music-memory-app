import { AppleMusicProvider } from "./AppleMusicProvider";
import type { MusicProvider } from "./MusicProvider";
import type { MusicProviderType } from "@/types";

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
// SpotifyProvider is NOT re-exported here — it is require()'d dynamically in
// getProvider() below so the SpotifyRemote native module is never loaded at
// import time. A static re-export would defeat that lazy-load guard.

// Singletons — created lazily on first use.
// SpotifyProvider is require()'d dynamically so the native module is never
// touched at import time (prevents startup crash if SpotifyiOS fails to init).
let _apple: AppleMusicProvider | null = null;
let _spotify: MusicProvider | null = null;

export function getProvider(type: MusicProviderType): MusicProvider {
  if (type === "spotify") {
    if (!_spotify) {
      // Dynamic require keeps SpotifyRemote native module load deferred until
      // the first moment someone actually uses Spotify.
      try {
        const { SpotifyProvider } = require("./SpotifyProvider") as typeof import("./SpotifyProvider");
        _spotify = new SpotifyProvider();
      } catch (e) {
        // Module load failures (e.g. native module unavailable) should surface
        // as the "Couldn't connect" alert, not a fatal crash.
        throw new Error("spotify_module_unavailable", { cause: e });
      }
    }
    return _spotify;
  }
  _apple ??= new AppleMusicProvider();
  return _apple;
}
