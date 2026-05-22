import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_PROMPTED_KEY = "review_last_prompted_at";
const MOMENT_COUNT_KEY = "review_moment_count";

// Prompt at 5 moments, then every 50 after that
function shouldPromptAtCount(count: number) {
  return count === 5 || (count > 5 && count % 50 === 0);
}

export async function maybeRequestReview() {
  try {
    // Dynamic require so a missing native module (old App Store binary) is caught
    // by the try/catch rather than crashing at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const StoreReview = require("expo-store-review") as typeof import("expo-store-review");
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // Don't re-prompt within 120 days
    const lastPrompted = await AsyncStorage.getItem(LAST_PROMPTED_KEY);
    if (lastPrompted) {
      const daysSince = (Date.now() - parseInt(lastPrompted)) / 86_400_000;
      if (daysSince < 120) return;
    }

    const countStr = await AsyncStorage.getItem(MOMENT_COUNT_KEY);
    const count = (parseInt(countStr ?? "0") || 0) + 1;
    await AsyncStorage.setItem(MOMENT_COUNT_KEY, String(count));

    if (!shouldPromptAtCount(count)) return;

    await StoreReview.requestReview();
    await AsyncStorage.setItem(LAST_PROMPTED_KEY, String(Date.now()));
  } catch {
    // Never let review prompt errors surface to the user
  }
}
