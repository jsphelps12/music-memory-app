// App lock (1.4): Settings → Privacy → Lock with Face ID. Off by default and
// per device. When on, the journal is covered on launch and after the app has
// been in the background for longer than LOCK_GRACE_MS, until Face ID (or the
// device passcode) unlocks it.
//
// The grace period matters for this app: capturing a song often means a quick
// trip to Apple Music or Spotify and back, and that shouldn't ask for Face ID.
//
// The decisions here are pure and tested (lib/__tests__/appLock.test.ts);
// contexts/AppLockContext.tsx does the AppState, storage and Face ID wiring.

/** How long the app may sit in the background before it locks again. */
export const LOCK_GRACE_MS = 60_000;

export const APP_LOCK_STORAGE_KEY = "app_lock_enabled";

/**
 * Whether returning to the app should lock it. Times come from a monotonic
 * clock (monotonicMs in modules/now-playing), not the wall clock, so setting
 * the date back can't shorten the time away. An impossible elapsed time
 * (negative, or not a number) locks: when in doubt, fail closed.
 */
export function shouldLockOnReturn(
  enabled: boolean,
  backgroundedAt: number | null,
  now: number,
  graceMs: number = LOCK_GRACE_MS
): boolean {
  if (!enabled || backgroundedAt === null) return false;
  const elapsed = now - backgroundedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return true;
  return elapsed >= graceMs;
}

/** Stored setting → boolean; anything but "1" is off. */
export function parseLockSetting(value: string | null): boolean {
  return value === "1";
}

export type BiometryKind = "face" | "touch" | "passcode";

/**
 * The name of what unlocks the app, for labels: "Face ID", "Touch ID", or
 * "Passcode" when the device has no enrolled biometrics (the lock still works
 * through the device passcode).
 */
export function lockMethodLabel(kind: BiometryKind): string {
  if (kind === "face") return "Face ID";
  if (kind === "touch") return "Touch ID";
  return "Passcode";
}
