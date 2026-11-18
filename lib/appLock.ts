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

// ── What to do with an authentication result ───────────────────────────────
//
// The lock must never leave someone stuck on the cover. A cancel just leaves
// the lock up with its button; a failure says why. If the phone can no longer
// authenticate anyone at all (its passcode was removed after the lock was
// turned on), the lock turns itself off and says so once: there is nothing
// left for it to check against, and asking again would loop forever.

/**
 * The outcome of one Face ID / passcode prompt: expo-local-authentication's
 * result, or `error: "exception"` when the call itself threw.
 */
export interface AuthAttempt {
  success: boolean;
  error?: string | null;
}

/** Errors meaning the phone has no passcode, so nothing can unlock the app. */
const NO_DEVICE_AUTH_ERRORS = new Set(["passcode_not_set", "not_enrolled"]);

/** The person (or the system) dismissed the prompt: nothing to explain. */
const CANCEL_ERRORS = new Set(["user_cancel", "system_cancel", "app_cancel", "user_fallback"]);

/**
 * Whether this result is worth a second look at the device (getEnrolledLevel)
 * before acting on it. Only the "no passcode" errors are.
 */
export function needsDeviceCheck(attempt: AuthAttempt): boolean {
  return !attempt.success && NO_DEVICE_AUTH_ERRORS.has(attempt.error ?? "");
}

/**
 * True when the phone can't authenticate anyone: the prompt said there's no
 * passcode, and the device check (`deviceHasAuth`, null when it couldn't be
 * made) doesn't contradict it.
 */
export function deviceCannotAuthenticate(attempt: AuthAttempt, deviceHasAuth: boolean | null): boolean {
  return needsDeviceCheck(attempt) && deviceHasAuth !== true;
}

export const LOCK_TURNED_OFF_MESSAGE =
  "This iPhone no longer has a passcode, so the Soundtracks lock is off. Set a passcode in Settings to turn it back on.";
export const NEEDS_PASSCODE_MESSAGE = "Set a passcode for this iPhone in Settings to use the lock.";

/** What to tell the person after a failed prompt; null for a cancel. */
export function authFailureMessage(attempt: AuthAttempt, label: string): string | null {
  const error = attempt.error ?? "";
  if (CANCEL_ERRORS.has(error)) return null;
  if (NO_DEVICE_AUTH_ERRORS.has(error)) return NEEDS_PASSCODE_MESSAGE;
  if (error === "lockout") return "Too many tries. Unlock your iPhone with its passcode, then try again.";
  if (error === "authentication_failed") return "That didn't match. Try again.";
  return `Couldn't check ${label}. Try again.`;
}

export type UnlockDecision =
  /** Lift the cover. */
  | { kind: "unlock" }
  /** Keep the cover and its retry button up, with this line (null: none). */
  | { kind: "stay_locked"; message: string | null }
  /** The phone can't authenticate: turn the setting off and show this once. */
  | { kind: "turn_off"; message: string };

export function decideUnlock(attempt: AuthAttempt, label: string, deviceHasAuth: boolean | null = null): UnlockDecision {
  if (attempt.success) return { kind: "unlock" };
  if (deviceCannotAuthenticate(attempt, deviceHasAuth)) return { kind: "turn_off", message: LOCK_TURNED_OFF_MESSAGE };
  return { kind: "stay_locked", message: authFailureMessage(attempt, label) };
}

export type ToggleDecision = { kind: "apply" } | { kind: "refuse"; message: string | null };

/**
 * Settings → Lock with Face ID. Either direction asks first. Turning it off
 * on a phone that can't authenticate anyone goes through: the lock already
 * can't protect anything there, and refusing would leave it stuck on.
 */
export function decideToggle(
  turningOn: boolean,
  attempt: AuthAttempt,
  label: string,
  deviceHasAuth: boolean | null = null
): ToggleDecision {
  if (attempt.success) return { kind: "apply" };
  if (!turningOn && deviceCannotAuthenticate(attempt, deviceHasAuth)) return { kind: "apply" };
  return { kind: "refuse", message: authFailureMessage(attempt, label) };
}
