import { requireNativeModule, EventEmitter, type EventSubscription } from "expo-modules-core";

export interface NowPlayingItem {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string;
  durationMs: number;
}

type NowPlayingEvents = {
  onNowPlayingChanged: (event: { item: NowPlayingItem | null }) => void;
};

const NowPlayingNative = requireNativeModule("NowPlaying");
const emitter = new EventEmitter<NowPlayingEvents>(NowPlayingNative);

export async function getNowPlayingItem(): Promise<NowPlayingItem | null> {
  return NowPlayingNative.getNowPlaying();
}

export function addNowPlayingListener(
  callback: (item: NowPlayingItem | null) => void
): EventSubscription {
  return emitter.addListener("onNowPlayingChanged", (event) => {
    callback(event.item);
  });
}

// Photos ↔ music prototype (1.4).
export interface LibrarySong {
  persistentId: string;
  storeId: string;
  title: string;
  artistName: string;
  /** Epoch ms. */
  dateAdded: number;
  playCount: number;
  /** Epoch ms, when known. */
  lastPlayed?: number;
}

export type LibraryAccess = "authorized" | "denied" | "restricted" | "notDetermined" | "unknown";

export async function requestLibraryAccess(): Promise<LibraryAccess> {
  return NowPlayingNative.requestLibraryAccess();
}

/** Library songs, most recently added first. */
export async function getLibrarySongs(limit: number): Promise<LibrarySong[]> {
  return NowPlayingNative.getLibrarySongs(limit);
}
