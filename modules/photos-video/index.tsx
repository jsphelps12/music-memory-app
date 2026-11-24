import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { StyleProp, ViewStyle } from "react-native";

// Linked video (1.4): a video played straight from the Photos library, no
// copy (modules/photos-video/ios). Used by the moment film.

export interface PhotosVideoProps {
  /** Photos local identifier of the video. */
  localId: string | null;
  /**
   * Loaded ahead, not on screen (1.4.1): a copy already on the phone if there
   * is one, else Photos' lighter streaming version, buffering only a few
   * seconds. Off (the default) loads the original. Builds before 1.4.1
   * ignore it and load the original.
   */
  preload?: boolean;
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

const native = requireOptionalNativeModule("PhotosVideo");

/**
 * Ducking (1.4): ask iOS to lower other audio (full Apple Music playback
 * included) while a clip's sound is on (true), and restore the session
 * (false). False if unavailable or the session refused. From 1.4.1,
 * turning it off returns true at once and finishes a moment later: it
 * deactivates the session so iOS brings the other audio back up (see the
 * module's Swift).
 */
export function setDuckOthers(on: boolean): boolean {
  try {
    return !!native?.setDuckOthers(on);
  } catch {
    return false;
  }
}
