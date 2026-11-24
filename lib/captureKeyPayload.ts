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

/** Same shape the capture-key function issues (supabase/functions/_shared/quickCapture.ts). */
export const CAPTURE_KEY_PATTERN = /^stc_[A-Za-z0-9_-]{43}$/;

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
}

export function normalizeProjectUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function encodeStoredCaptureKey(k: Omit<StoredCaptureKey, "v">): string {
  const value: StoredCaptureKey = { v: 1, key: k.key, userId: k.userId, url: normalizeProjectUrl(k.url), anonKey: k.anonKey };
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
  return { v: 1, key: o.key, userId: o.userId, url: o.url, anonKey: o.anonKey };
}

/** Whether the stored key already serves this user on this project. */
export function storedKeyServes(stored: StoredCaptureKey | null, userId: string, url: string): boolean {
  return !!stored && stored.userId === userId && stored.url === normalizeProjectUrl(url);
}
