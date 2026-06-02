import { requireNativeModule, EventEmitter, type EventSubscription } from "expo-modules-core";

export interface SpotifyPlayerState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

// requireNativeModule throws if the native module failed to register (e.g.
// xcframework runtime error). Wrap defensively so a Spotify init failure
// doesn't crash the whole app — Spotify methods will return no-ops instead.
let Native: any = null;
let emitter: EventEmitter<{
  onPlayerStateChanged: (state: SpotifyPlayerState) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}> | null = null;

try {
  Native = requireNativeModule("SpotifyRemote");
  emitter = new EventEmitter(Native);
} catch (e) {
  console.warn("[SpotifyRemote] Native module failed to load:", e);
}

const noopSub: EventSubscription = { remove: () => {} };

export const SpotifyRemote = {
  get isAvailable(): boolean {
    return Native !== null;
  },

  /**
   * Connect to the Spotify App Remote using an already-obtained OAuth access token.
   * Opens the Spotify app if not running. Returns true on successful connection.
   */
  connect(clientId: string, redirectUrl: string, accessToken: string): Promise<boolean> {
    if (!Native) return Promise.resolve(false);
    return Native.connect(clientId, redirectUrl, accessToken);
  },

  disconnect(): void {
    Native?.disconnect();
  },

  isConnected(): boolean {
    return Native ? Native.isConnected() : false;
  },

  /** Play a Spotify track/album/playlist URI, e.g. "spotify:track:abc123". */
  playUri(uri: string): Promise<void> {
    if (!Native) return Promise.reject(new Error("spotify_unavailable"));
    return Native.playUri(uri);
  },

  pause(): void {
    Native?.pause();
  },

  resume(): void {
    Native?.resume();
  },

  /** Seek to an absolute position in milliseconds. */
  seekTo(positionMs: number): void {
    Native?.seekTo(positionMs);
  },

  addStateListener(cb: (state: SpotifyPlayerState) => void): EventSubscription {
    return emitter?.addListener("onPlayerStateChanged", cb) ?? noopSub;
  },

  addConnectedListener(cb: () => void): EventSubscription {
    return emitter?.addListener("onConnected", cb) ?? noopSub;
  },

  addDisconnectedListener(cb: () => void): EventSubscription {
    return emitter?.addListener("onDisconnected", cb) ?? noopSub;
  },
};
