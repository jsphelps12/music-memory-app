/**
 * The capture key as the phone keeps it ("Remember this song", 1.5;
 * docs/PLAN-1.5.md section 3). lib/captureKey.ts writes it to the keychain
 * through expo-secure-store; the App Intent
 * (plugins/remember-this-song/RememberThisSong.swift) reads the same item
 * with Keychain Services, so the names below are repeated there and must
 * stay identical. Pure: importable from vitest.
 *
 * expo-secure-store files an item under `<keychainService>:no-auth` (no
 * Face ID requirement), with the item name as both the account and the
 * generic attribute, in the app's default access group.
 */

/** expo-secure-store `keychainService`. The Swift side reads `soundtracks.capture:no-auth`. */
export const CAPTURE_KEYCHAIN_SERVICE = "soundtracks.capture";
/** The key, its owner and where to send it (JSON, below). Cleared on sign-out. */
export const CAPTURE_KEY_ITEM = "capture_key_v1";
/** A random id for this install. Belongs to the device, so sign-out keeps it. */
export const CAPTURE_DEVICE_ITEM = "capture_device_v1";

/**
 * The keys of the JSON body the App Intent posts to quick-capture
 * (QuickCaptureClient.save in RememberThisSong.swift; parsed by
 * parseQuickCaptureBody in supabase/functions/_shared/quickCapture.ts). The
 * intent always sends title, artist, capturedAt and utcOffsetMinutes; the
 * rest only when it has them. `country` is the phone's region as two
 * uppercase letters, a storefront guess for the catalog lookup. The test
 * checks the Swift side names each one.
 */
export const QUICK_CAPTURE_BODY_FIELDS = [
  "title",
  "artist",
  "capturedAt",
  "utcOffsetMinutes",
  "appleMusicId",
  "album",
  "country",
] as const;

/** Same shape the capture-key function issues (supabase/functions/_shared/quickCapture.ts). */
export const CAPTURE_KEY_PATTERN = /^stc_[A-Za-z0-9_-]{43}$/;

/**
 * The app replaces its key once it's this old, on the next launch while
 * signed in. quick-capture refuses keys over 90 days old (LIMITS.keyMaxAgeMs
 * in supabase/functions/_shared/quickCapture.ts), so a phone that opens
 * Soundtracks now and then never meets that limit.
 */
export const KEY_ROTATE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface StoredCaptureKey {
  v: 1;
  /** The secret. Never logged, never sent anywhere but quick-capture. */
  key: string;
  /** Whose journal it saves to; a different signed-in user gets a new key. */
  userId: string;
  /** The Supabase project URL, no trailing slash. The intent posts to `${url}/functions/v1/quick-capture`. */
  url: string;
  /** The project's public anon key, sent as `apikey` (public, not a secret). */
  anonKey: string;
  /** When the key was issued, epoch ms. */
  issuedAt: number;
}

export function normalizeProjectUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function encodeStoredCaptureKey(k: Omit<StoredCaptureKey, "v">): string {
  const value: StoredCaptureKey = {
    v: 1,
    key: k.key,
    userId: k.userId,
    url: normalizeProjectUrl(k.url),
    anonKey: k.anonKey,
    issuedAt: k.issuedAt,
  };
  return JSON.stringify(value);
}

/** The stored item, or null when it's missing, unreadable or from another format. */
export function parseStoredCaptureKey(raw: string | null | undefined): StoredCaptureKey | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.key !== "string" || !CAPTURE_KEY_PATTERN.test(o.key)) return null;
  if (typeof o.userId !== "string" || !o.userId) return null;
  if (typeof o.url !== "string" || !/^https?:\/\//.test(o.url)) return null;
  if (typeof o.anonKey !== "string") return null;
  if (typeof o.issuedAt !== "number" || !Number.isFinite(o.issuedAt)) return null;
  return { v: 1, key: o.key, userId: o.userId, url: o.url, anonKey: o.anonKey, issuedAt: o.issuedAt };
}

/** Whether the stored key already serves this user on this project. */
export function storedKeyServes(stored: StoredCaptureKey | null, userId: string, url: string): boolean {
  return !!stored && stored.userId === userId && stored.url === normalizeProjectUrl(url);
}

/** Whether a key that serves this user is old enough to replace (or dated in the future: a changed clock). */
export function storedKeyDueForRotation(stored: StoredCaptureKey, nowMs: number): boolean {
  const age = nowMs - stored.issuedAt;
  return age >= KEY_ROTATE_AFTER_MS || age < -24 * 60 * 60 * 1000;
}

/** Which keys a sign-out revokes: every device's (global sign-out) or this install's. */
export type CaptureKeyRevokeScope = "all" | "device";

/**
 * The capture-key DELETE body: no deviceId revokes all the user's keys. Null
 * when a device revoke has no install id (nothing was ever issued here).
 */
export function captureKeyRevokeBody(
  scope: CaptureKeyRevokeScope,
  installId: string | null
): { deviceId?: string } | null {
  if (scope === "all") return {};
  return installId ? { deviceId: installId } : null;
}
