import { AppleMusicProvider } from "./AppleMusicProvider";
import { SpotifyProvider } from "./SpotifyProvider";
import type { MusicProvider } from "./MusicProvider";
import type { MusicProviderType } from "@/types";

export type { MusicProvider, PlaybackState } from "./MusicProvider";
export { AppleMusicProvider } from "./AppleMusicProvider";
export { SpotifyProvider } from "./SpotifyProvider";

// Singletons — created lazily on first use so native modules aren't touched
// at import time (avoids startup crashes if a native module fails to init).
let _apple: AppleMusicProvider | null = null;
let _spotify: SpotifyProvider | null = null;

export function getProvider(type: MusicProviderType): MusicProvider {
  if (type === "spotify") {
    _spotify ??= new SpotifyProvider();
    return _spotify;
  }
  _apple ??= new AppleMusicProvider();
  return _apple;
}
