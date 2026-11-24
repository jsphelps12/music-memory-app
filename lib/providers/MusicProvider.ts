import type { Song, MusicProviderType } from "@/types";
import type { SongLookup } from "@/lib/songMetadata";

export interface PlaybackState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

export interface MusicProvider {
  readonly type: MusicProviderType;

  /** Returns true if the SDK is available and the user is authorized. */
  isAvailable(): Promise<boolean>;

  /** Prompts the user to authorize this provider. Returns true on success. */
  authorize(): Promise<boolean>;

  /** Search the provider's catalog. Returned Songs carry .provider and the correct ID. */
  search(query: string): Promise<Song[]>;

  /** Look up a single track by its provider-native ID. */
  lookupById(id: string): Promise<Song | null>;

  /** Begin full playback. Throws if the SDK is unavailable or playback fails. */
  play(song: Song): Promise<void>;

  pause(): void;
  resume(): void;
  stop(): void;

  /** Seek to an absolute position in seconds. */
  seekTo(seconds: number): void;

  /**
   * Fetch a 30-second preview URL for the song.
   * Returns null if unavailable (non-blocking — caller will silence the error).
   */
  fetchPreviewUrl(song: Song): Promise<string | null>;

  /**
   * The preview plus catalog details saved on a moment (genre, release date,
   * artist and album ids, length). Optional: a provider without catalog
   * details (Spotify) omits it, and the save uses fetchPreviewUrl alone.
   * Never rejects.
   */
  lookupSong?(song: Song): Promise<SongLookup>;

  /**
   * Subscribe to playback state changes. Returns an unsubscribe function.
   * The callback is called whenever play/pause/position/duration changes.
   */
  onStateChange(cb: (state: PlaybackState) => void): () => void;
}
