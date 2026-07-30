import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

const CHECK_COOLDOWN_MS = 5 * 60 * 1000;
const BACKGROUND_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Manages EAS OTA updates silently without disrupting active sessions.
 *
 * Strategy:
 * - On mount and each foreground: check for updates, download silently if available
 * - Apply (reloadAsync) only when the user returns after 30+ minutes in background —
 *   at that point they've effectively "re-opened" the app, so a brief splash is tolerable
 * - If no long-background event occurs, the downloaded bundle applies on next cold launch
 *
 * Guarded by Updates.isEnabled (no-ops in dev / Expo Go) and a 5-min check cooldown.
 */
export function useOtaUpdate() {
  const lastCheckedRef = useRef(0);
  const backgroundedAtRef = useRef(0);
  const hasPendingUpdateRef = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    async function checkAndDownload() {
      const now = Date.now();
      if (now - lastCheckedRef.current < CHECK_COOLDOWN_MS) return;
      lastCheckedRef.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        hasPendingUpdateRef.current = true;
      } catch {
        // Never surface update errors to the user
      }
    }

    // Deliberately NOT checking on mount: the native runtime is configured with
    // checkOnLaunch=ALWAYS, so it is already downloading this same update. Doing
    // it again here meant two concurrent full-bundle downloads competing with
    // ~7 startup REST calls on precisely the launch after a publish — enough to
    // push the profile fetch past its timeout on a slow connection and make the
    // app look broken "the first time". Foreground transitions still check,
    // which is where the native check doesn't help.
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background") {
        backgroundedAtRef.current = Date.now();
      } else if (state === "active") {
        if (
          hasPendingUpdateRef.current &&
          backgroundedAtRef.current > 0 &&
          Date.now() - backgroundedAtRef.current >= BACKGROUND_THRESHOLD_MS
        ) {
          Updates.reloadAsync().catch(() => {});
          return;
        }
        checkAndDownload();
      }
    });

    return () => sub.remove();
  }, []);
}
