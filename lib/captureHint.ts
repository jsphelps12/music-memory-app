// The one-time "Hold + for more" hint (1.4, components/CaptureHint.tsx):
// shown once per device, and never after someone has long-pressed + on
// their own.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "capture_hold_hint_v1";

export async function captureHintSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    return true; // can't remember it: don't risk showing it every time
  }
}

export async function markCaptureHintSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {}
}
