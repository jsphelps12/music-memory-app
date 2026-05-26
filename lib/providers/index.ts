import { AppleMusicProvider } from "./AppleMusicProvider";
import { SpotifyProvider } from "./SpotifyProvider";
import type { MusicProvider } from "./MusicProvider";
import type { MusicProviderType } from "@/types";

export type { MusicProvider, PlaybackState } from "./MusicProvider";
export { AppleMusicProvider } from "./AppleMusicProvider";
export { SpotifyProvider } from "./SpotifyProvider";

// Singletons — one instance per provider for the lifetime of the app
const _apple = new AppleMusicProvider();
const _spotify = new SpotifyProvider();

export function getProvider(type: MusicProviderType): MusicProvider {
  return type === "spotify" ? _spotify : _apple;
}
