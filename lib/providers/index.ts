import { AppleMusicProvider } from "./AppleMusicProvider";
import type { MusicProvider } from "./MusicProvider";
import type { MusicProviderType } from "@/types";

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
      const { SpotifyProvider } = require("./SpotifyProvider") as typeof import("./SpotifyProvider");
      _spotify = new SpotifyProvider();
    }
    return _spotify;
  }
  _apple ??= new AppleMusicProvider();
  return _apple;
}
