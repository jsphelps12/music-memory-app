import { requireNativeModule, EventEmitter, type EventSubscription } from "expo";

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
  albumTitle?: string;
  /** Same for every song on one album in the library. */
  albumId?: string;
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

/** Whether the library may be read, without asking ("Last week", 1.4). */
export function libraryAccessStatus(): LibraryAccess {
  try {
    return NowPlayingNative.libraryAccessStatus();
  } catch {
    return "unknown";
  }
}

/** A song from Apple Music's recently played list (streamed ones too). */
export interface RecentlyPlayedSong {
  storeId: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  artworkUrl?: string;
}

/**
 * Apple Music's recently played songs, newest first ("Last week", 1.4).
 * Short and undated; empty without MusicKit access or a subscription, or on
 * a build that predates the native function.
 */
export async function getRecentlyPlayed(limit = 50): Promise<RecentlyPlayedSong[]> {
  try {
    return (await NowPlayingNative.getRecentlyPlayed(limit)) ?? [];
  } catch {
    return [];
  }
}

/** A span's photos, from PhotoKit metadata (From before, 1.4). */
export interface PhotoStats {
  /** Photos taken, screenshots left out. */
  count: number;
  favorites: number;
  /** Up to maxCoords [lat, lng] samples, evenly through the span. */
  coords: [number, number][];
}

/**
 * Photo counts, favourites and sampled locations for each [from, to) span
 * (epoch ms). Null on a build without the native function, so callers can
 * fall back.
 */
export async function photoStats(ranges: [number, number][], maxCoords = 20): Promise<PhotoStats[] | null> {
  try {
    return await NowPlayingNative.photoStats(ranges, maxCoords);
  } catch {
    return null;
  }
}

/**
 * App lock (1.4): a clock that can't be set back and counts through sleep.
 * Falls back to Date.now() where the native function is missing.
 */
export function monotonicMs(): number {
  try {
    return NowPlayingNative.monotonicMs();
  } catch {
    return Date.now();
  }
}
