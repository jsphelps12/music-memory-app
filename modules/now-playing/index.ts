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
