import { requireNativeView } from "expo";
import type { StyleProp, ViewStyle } from "react-native";

// Linked video (1.4): a video played straight from the Photos library, no
// copy (modules/photos-video/ios). Used by the moment film.

export interface PhotosVideoProps {
  /** Photos local identifier of the video. */
  localId: string | null;
  playing: boolean;
  muted: boolean;
  loop: boolean;
  /** 0–1 when not muted (the film plays clips at CLIP_LEVEL under a ducked song). */
  volume?: number;
  style?: StyleProp<ViewStyle>;
  onReady?: (e: { nativeEvent: { durationMs: number } }) => void;
  onProgress?: (e: { nativeEvent: { fraction: number } }) => void;
  /** Only after it actually played to the end (never for a clip that failed to load). */
  onEnd?: () => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
}

let NativeView: React.ComponentType<PhotosVideoProps> | null = null;
try {
  NativeView = requireNativeView<PhotosVideoProps>("PhotosVideo");
} catch {
  NativeView = null;
}

/** The native view, or null on a build without it. */
export const PhotosVideoView = NativeView;
