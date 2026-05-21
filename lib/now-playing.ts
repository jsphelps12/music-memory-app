import { getNowPlayingItem, addNowPlayingListener } from "@/modules/now-playing";
import type { NowPlayingItem } from "@/modules/now-playing";
import type { EventSubscription } from "expo-modules-core";
import type { Song } from "@/types";

function itemToSong(item: NowPlayingItem): Song {
  return {
    id: item.id,
    title: item.title,
    artistName: item.artistName,
    albumName: "",
    artworkUrl: item.artworkUrl,
    appleMusicId: item.id,
    durationMs: item.durationMs,
  };
}

/**
 * Get the currently playing song from the system Music player.
 */
export async function getNowPlaying(): Promise<Song | null> {
  try {
    const item = await getNowPlayingItem();
    if (!item?.title) return null;
    return itemToSong(item);
  } catch {
    return null;
  }
}

/**
 * Subscribe to now playing changes. Callback fires when the song changes.
 * Returns a subscription that should be removed on cleanup.
 */
export function onNowPlayingChange(
  callback: (song: Song | null) => void
): EventSubscription {
  return addNowPlayingListener((item) => {
    callback(item?.title ? itemToSong(item) : null);
  });
}
