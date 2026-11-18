// Device-local records that belong to whoever is signed in but aren't keyed
// by user id: From before, Last week, photo analyses, nudge questions, the
// capture hint. Signing out (or deleting the account) removes them, so the
// next account on this phone starts clean. Per-user keys (the timeline,
// profile and browse caches, the capture draft, the daily check-in) are
// cleared by their own modules' clear* helpers in contexts/AuthContext.tsx.
//
// The names are private to the files that own them, so they're repeated
// here; lib/__tests__/signOutKeys.test.ts reads those files and fails when a
// key there is missing from this list (a version bump, a new record).
// Earlier versions of a key stay listed so a bump never strands a copy.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const SIGN_OUT_KEYS: readonly string[] = [
  // lib/pastPairingsData.ts (From before): this week's picks and saved
  // links, what's been shown, what's been dismissed.
  "frombefore_picks_v4",
  "frombefore_picks_v3",
  "frombefore_picks_v2",
  "frombefore_shown_v1",
  "frombefore_dismissed_v1",
  // lib/lastWeekData.ts (Last week): weekly play counts, the streamed log,
  // dismissed/seen weeks, the access ask, the day-photos choice.
  "lastweek_playcounts_v1",
  "lastweek_streamed_v1",
  "lastweek_dismissed_v1",
  "lastweek_seen_v1",
  "lastweek_ask_dismissed_v1",
  "lastweek_suggest_day_photos_v1",
  "lastweek_observed_at_v1",
  // lib/photoAnalysisStore.ts
  "photo_analysis_v1",
  // lib/nudgeQuestionStore.ts
  "nudge_questions_v1",
  // lib/captureHint.ts
  "capture_hold_hint_v1",
];

/** Removes every key in SIGN_OUT_KEYS. Never throws. */
export async function clearSignOutKeys(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...SIGN_OUT_KEYS]);
  } catch {}
}
