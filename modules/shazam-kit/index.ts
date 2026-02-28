import { requireNativeModule } from "expo-modules-core";

export interface ShazamResult {
  title: string;
  artist: string;
  artworkUrl: string;
  appleMusicId: string;
}

const ShazamKitNative = requireNativeModule("ShazamKit");

export async function identifyAudio(): Promise<ShazamResult> {
  return ShazamKitNative.identifyAudio();
}

export async function stopShazamListening(): Promise<void> {
  return ShazamKitNative.stopListening();
}
