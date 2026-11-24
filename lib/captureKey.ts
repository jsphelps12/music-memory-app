/**
 * The capture key behind "Remember this song" (1.5, docs/PLAN-1.5.md
 * section 3): Siri, Shortcuts and the Action button run an App Intent
 * (plugins/remember-this-song) that saves the playing song without opening
 * the app. The intent can't use the app's session, so the app gets it a key
 * of its own:
 *
 * - Signed in (each launch): `ensureCaptureKey` makes sure the keychain holds
 *   a key for this user and project, asking the capture-key edge function for
 *   one when it doesn't. A key the server stops accepting is deleted by the
 *   intent, so the next launch gets a new one.
 * - Sign-out: `revokeCaptureKey` (while the session is still valid), then
 *   `clearCaptureKey` with the rest of the per-user teardown. Account
 *   deletion cascades on the server; `clearCaptureKey` empties the keychain.
 * - Signed out at launch with a key left behind (a reinstall keeps keychain
 *   items): `discardLeftoverCaptureKey` has the key revoke itself.
 *
 * Never throws: a missing key only means the intent asks the person to open
 * the app. The secret is never logged.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import {
  CAPTURE_DEVICE_ITEM,
  CAPTURE_KEY_ITEM,
  CAPTURE_KEY_PATTERN,
  CAPTURE_KEYCHAIN_SERVICE,
  encodeStoredCaptureKey,
  normalizeProjectUrl,
  parseStoredCaptureKey,
  storedKeyServes,
  type StoredCaptureKey,
} from "@/lib/captureKeyPayload";

type SecureStore = typeof import("expo-secure-store");

/**
 * expo-secure-store, loaded lazily (lib/providers/index.ts explains why it
 * is never imported at startup). iOS only: the intent is iOS only.
 */
function secureStore(): SecureStore | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-secure-store") as SecureStore;
  } catch {
    return null;
  }
}

/**
 * After first unlock, so Siri can read it with the phone locked; this device
 * only, so a backup restored to another phone doesn't carry the key (that
 * phone gets its own after sign-in).
 */
function options(ss: SecureStore) {
  return { keychainService: CAPTURE_KEYCHAIN_SERVICE, keychainAccessible: ss.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
}

const REQUEST_TIMEOUT_MS = 4000;

function project(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: normalizeProjectUrl(url), anonKey } : null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

async function readStored(ss: SecureStore): Promise<StoredCaptureKey | null> {
  try {
    return parseStoredCaptureKey(await ss.getItemAsync(CAPTURE_KEY_ITEM, options(ss)));
  } catch {
    return null;
  }
}

async function deviceId(ss: SecureStore): Promise<string> {
  const existing = await ss.getItemAsync(CAPTURE_DEVICE_ITEM, options(ss)).catch(() => null);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const id = Crypto.randomUUID();
  await ss.setItemAsync(CAPTURE_DEVICE_ITEM, id, options(ss));
  return id;
}

/** The key revokes itself on the project it was issued by (no session needed). */
async function selfRevoke(k: Pick<StoredCaptureKey, "key" | "url" | "anonKey">): Promise<boolean> {
  try {
    const res = await withTimeout(
      fetch(`${k.url}/functions/v1/quick-capture`, {
        method: "DELETE",
        headers: { Authorization: `Capture ${k.key}`, apikey: k.anonKey },
      }),
      REQUEST_TIMEOUT_MS
    );
    // 401: already revoked or unknown, which is the outcome wanted.
    return res !== "timeout" && (res.ok || res.status === 401);
  } catch {
    return false;
  }
}

/**
 * Bumped by every clear. A key request that started before a sign-out must
 * not write its key into the keychain afterwards.
 */
let generation = 0;
/** One request at a time; a different user's waits for the one before. */
let inFlight: { userId: string; promise: Promise<void> } | null = null;

/** Makes sure this phone holds a capture key for `userId`. Never throws. */
export function ensureCaptureKey(userId: string): Promise<void> {
  if (inFlight?.userId === userId) return inFlight.promise;
  const before = inFlight?.promise ?? Promise.resolve();
  const promise: Promise<void> = before
    .then(() => obtain(userId))
    .catch((e) => {
      Sentry.captureException(e, { tags: { area: "capture_key" } });
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { userId, promise };
  return promise;
}

async function obtain(userId: string): Promise<void> {
  const ss = secureStore();
  const proj = project();
  if (!ss || !proj) return;
  const startedAt = generation;

  const stored = await readStored(ss);
  if (storedKeyServes(stored, userId, proj.url)) return;
  if (stored) {
    // Someone else's key, or another project's: retire it first.
    await selfRevoke(stored);
    await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss)).catch(() => {});
  }

  const install = await deviceId(ss);
  const { data, error } = await supabase.functions.invoke("capture-key", {
    body: { deviceId: install, deviceLabel: Constants.deviceName ?? "iPhone" },
  });
  // Offline, or the function isn't deployed yet: try again next launch.
  if (error) {
    Sentry.addBreadcrumb({ category: "capture_key", message: "capture key not issued", level: "warning" });
    return;
  }
  const key = (data as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || !CAPTURE_KEY_PATTERN.test(key)) return;

  // Signed out (or someone else signed in) while the request was out.
  const { data: session } = await supabase.auth.getSession();
  if (startedAt !== generation || session.session?.user.id !== userId) {
    await selfRevoke({ key, ...proj });
    return;
  }
  await ss.setItemAsync(CAPTURE_KEY_ITEM, encodeStoredCaptureKey({ key, userId, ...proj }), options(ss));
}

/**
 * Sign-out, while the session is still valid: revokes this install's keys on
 * the server, falling back to the key revoking itself. Bounded and never
 * throws, so sign-out can't hang on it.
 */
export async function revokeCaptureKey(): Promise<void> {
  const ss = secureStore();
  if (!ss) return;
  try {
    const install = await ss.getItemAsync(CAPTURE_DEVICE_ITEM, options(ss)).catch(() => null);
    if (install) {
      const res = await withTimeout(
        supabase.functions.invoke("capture-key", { method: "DELETE", body: { deviceId: install } }),
        REQUEST_TIMEOUT_MS
      );
      if (res !== "timeout" && !res.error) return;
    }
    const stored = await readStored(ss);
    if (stored) await selfRevoke(stored);
  } catch {
    // Best effort: clearCaptureKey still empties the keychain.
  }
}

/** Removes the key from this phone (per-user teardown). Never throws. */
export async function clearCaptureKey(): Promise<void> {
  generation++;
  const ss = secureStore();
  if (!ss) return;
  await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss)).catch(() => {});
}

/**
 * Signed out at launch: a key still in the keychain was left by an earlier
 * install or a teardown that didn't finish. It revokes itself and goes.
 * Never throws.
 */
export async function discardLeftoverCaptureKey(): Promise<void> {
  const ss = secureStore();
  if (!ss) return;
  try {
    const stored = await readStored(ss);
    if (!stored) return;
    await selfRevoke(stored);
    // Only if it's still the same key: someone may have signed in meanwhile.
    if ((await readStored(ss))?.key === stored.key) {
      await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss));
    }
  } catch {
    // Next signed-out launch tries again.
  }
}
