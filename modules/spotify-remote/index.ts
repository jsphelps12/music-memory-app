import { requireNativeModule, EventEmitter, type EventSubscription } from "expo-modules-core";

export interface SpotifyPlayerState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

const Native = requireNativeModule("SpotifyRemote");
const emitter = new EventEmitter<{
  onPlayerStateChanged: (state: SpotifyPlayerState) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}>(Native);

export const SpotifyRemote = {
  /**
   * Connect to the Spotify App Remote using an already-obtained OAuth access token.
   * Opens the Spotify app if not running. Returns true on successful connection.
   */
  connect(clientId: string, redirectUrl: string, accessToken: string): Promise<boolean> {
    return Native.connect(clientId, redirectUrl, accessToken);
  },

  disconnect(): void {
    Native.disconnect();
  },

  isConnected(): boolean {
    return Native.isConnected();
  },

  /** Play a Spotify track/album/playlist URI, e.g. "spotify:track:abc123". */
  playUri(uri: string): Promise<void> {
    return Native.playUri(uri);
  },

  pause(): void {
    Native.pause();
  },

  resume(): void {
    Native.resume();
  },

  /** Seek to an absolute position in milliseconds. */
  seekTo(positionMs: number): void {
    Native.seekTo(positionMs);
  },

  addStateListener(cb: (state: SpotifyPlayerState) => void): EventSubscription {
    return emitter.addListener("onPlayerStateChanged", cb);
  },

  addConnectedListener(cb: () => void): EventSubscription {
    return emitter.addListener("onConnected", cb);
  },

  addDisconnectedListener(cb: () => void): EventSubscription {
    return emitter.addListener("onDisconnected", cb);
  },
};
