// Device-local records that belong to whoever is signed in: From before,
// Last week, photo analyses, nudge questions, the capture hint, parked deep
// links. Signing out
// (or deleting the account) removes them, so the next account on this phone
// starts clean. Other per-user caches (timeline, profile, browse, capture
// draft, daily check-in) are cleared by their own modules' clear* helpers in
// contexts/AuthContext.tsx; in-memory copies by clearInMemoryStores there.
// clearCaptureDraft also deletes the drafts' kept photo copies
// (Documents/capture-drafts/<userId>/, lib/captureDraftFiles.ts).
// The capture key for Siri's background save lives in the keychain, not
// AsyncStorage: lib/captureKey.ts clearCaptureKey, called from the same
// teardown (and revokeCaptureKey before sign-out).
//
// The names are repeated here rather than imported (importing those modules
// would pull native code into this one); lib/__tests__/signOutKeys.test.ts
// reads the owning files and fails when a fixed key there is missing. Earlier versions of a key stay
// listed so a bump never strands a copy.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const SIGN_OUT_KEYS: readonly string[] = [
  // From before (lib/pastPairings.ts): the device-wide keys from before they
  // were per account, and older versions.
  "frombefore_picks_v4",
  "frombefore_shown_v1",
  "frombefore_dismissed_v1",
  "frombefore_picks_v3",
  "frombefore_picks_v2",
  // Last week (lib/lastWeekData.ts, lib/lastWeekSnapshots.ts).
  "lastweek_streamed_v1",
  "lastweek_dismissed_v1",
  "lastweek_seen_v1",
  "lastweek_ask_dismissed_v1",
  "lastweek_suggest_day_photos_v1",
  "lastweek_observed_at_v1",
  "lastweek_playcounts_v1",
  // lib/photoAnalysisStore.ts
  "photo_analysis_v1",
  // lib/nudgeQuestionStore.ts
  "nudge_questions_v1",
  // lib/captureHint.ts
  "capture_hold_hint_v1",
  // hooks/useDeepLinkHandler.ts: links parked until someone signs in. Left
  // behind, the next account to sign in here would open the last one's
  // invite. (has_launched there is device-wide and stays.)
  "pending_invite_code",
  "pending_friend_token",
  "pending_share_token",
  "pending_gift_token",
];

/**
 * Keys named per account or per week: every From before key (now
 * `frombefore_*_<userId>`), every weekly play-count snapshot, and the Memory
 * widget's words setting and shown days (`widget_*_<userId>`,
 * lib/widgetSettings.ts; its file in the App Group is cleared by
 * clearMemoryWidget).
 */
export const SIGN_OUT_PREFIXES: readonly string[] = ["frombefore_", "lastweek_playcounts_v2:", "widget_"];

export function isSignOutKey(key: string): boolean {
  return SIGN_OUT_KEYS.includes(key) || SIGN_OUT_PREFIXES.some((p) => key.startsWith(p));
}

/** Removes every listed and prefixed key. Never throws. */
export async function clearSignOutKeys(): Promise<void> {
  let all: readonly string[] = [];
  try {
    all = await AsyncStorage.getAllKeys();
  } catch {}
  const keys = new Set([...SIGN_OUT_KEYS, ...all.filter(isSignOutKey)]);
  try {
    await AsyncStorage.multiRemove([...keys]);
  } catch {}
}
