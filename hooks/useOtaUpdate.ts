import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

const CHECK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks for an available EAS OTA update each time the app foregrounds.
 * If a new bundle is found, it is fetched and applied immediately via reload.
 *
 * Guarded by:
 * - Updates.isEnabled — no-ops in dev / Expo Go
 * - A 5-minute cooldown to avoid hammering the update service
 */
export function useOtaUpdate() {
  const lastCheckedRef = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    async function checkAndApply() {
      const now = Date.now();
      if (now - lastCheckedRef.current < CHECK_COOLDOWN_MS) return;
      lastCheckedRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // Never surface update errors to the user
      }
    }

    // Check immediately on mount — catches cold-start cases where Expo's
    // default check downloaded a bundle but didn't apply it yet.
    checkAndApply();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") checkAndApply();
    });

    return () => sub.remove();
  }, []);
}
