/**
 * The capture key behind "Remember this song" (1.5, docs/PLAN-1.5.md
 * section 3): Siri, Shortcuts and the Action button run an App Intent
 * (plugins/remember-this-song) that saves the playing song without opening
 * the app. The intent can't use the app's session, so the app gets it a key
 * of its own:
 *
 * - Signed in (each launch, and each return to the app through
 *   `ensureCaptureKeyOnResume`): `ensureCaptureKey` makes sure the keychain holds a key for this user and
 *   project, asking the capture-key edge function for one when it doesn't,
 *   and replacing it once it's 30 days old (the server refuses keys over 90
 *   days old). A key the server stops accepting (a password change, the
 *   10-key cap) is deleted by the intent, so the next open gets a new one.
 *   A request that fails (offline) is tried again on the next return to the
 *   app, not only on the next launch.
 * - Sign-out: `revokeCaptureKey("all")` (while the session is still valid;
 *   the app's sign-out is global, so every device's key goes), then
 *   `clearCaptureKey` with the rest of the per-user teardown. Account
 *   deletion cascades on the server; `clearCaptureKey` empties the keychain.
 * - The session ending any other way (refresh token expired or revoked, the
 *   account deleted elsewhere, a corrupt stored session) or a signed-out
 *   launch with a key left behind (a reinstall keeps keychain items):
 *   `discardCaptureKey` takes the key out of the keychain and has it revoke
 *   itself. It needs no session and is safe to call any number of times.
 *
 * Never throws: a missing key only means the intent asks the person to open
 * the app. The secret is never logged.
 */
import { Platform } from "react-native";
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
  captureKeyRevokeBody,
  storedKeyDueForRotation,
  storedKeyServes,
  type CaptureKeyRevokeScope,
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

/** Each request, and sign-out's revoke with its fallback all together. */
const REQUEST_TIMEOUT_MS = 4000;
/**
 * Coming back to the app asks for a new key (a missing one, or a rotation)
 * at most this often after the last one was issued. The keychain itself is
 * checked on every return.
 */
export const CAPTURE_KEY_REISSUE_MS = 10 * 60 * 1000;
/**
 * What the key's row is labelled with. Generic on purpose: the phone's own
 * name ("Josh's iPhone") is personal and the label is shown nowhere.
 */
function deviceLabel(): string {
  return Platform.OS === "ios" && Platform.isPad ? "iPad" : "iPhone";
}

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
async function selfRevoke(
  k: Pick<StoredCaptureKey, "key" | "url" | "anonKey">,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<boolean> {
  try {
    const res = await withTimeout(
      fetch(`${k.url}/functions/v1/quick-capture`, {
        method: "DELETE",
        headers: { Authorization: `Capture ${k.key}`, apikey: k.anonKey },
      }),
      timeoutMs
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
/**
 * When a key was last issued to this phone for the user. Only a success sets
 * it, so a request that failed is tried again on the next return to the
 * app; every clear forgets it.
 */
let lastIssued: { userId: string; at: number } | null = null;

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

/**
 * Coming back to the app. The keychain is read every time (cheap): a good
 * key for this user means nothing to do. A missing one (the server revoked
 * it and the intent deleted it, or the last request failed) or one due for
 * rotation goes through ensureCaptureKey, unless a key was issued to this
 * phone within CAPTURE_KEY_REISSUE_MS. Never throws.
 */
export async function ensureCaptureKeyOnResume(userId: string, now = Date.now()): Promise<void> {
  const ss = secureStore();
  const proj = project();
  if (!ss || !proj) return;
  const stored = await readStored(ss);
  if (storedKeyServes(stored, userId, proj.url) && !storedKeyDueForRotation(stored!, now)) return;
  if (lastIssued?.userId === userId && now - lastIssued.at < CAPTURE_KEY_REISSUE_MS) return;
  await ensureCaptureKey(userId);
}

async function obtain(userId: string): Promise<void> {
  const ss = secureStore();
  const proj = project();
  if (!ss || !proj) return;
  const startedAt = generation;

  const stored = await readStored(ss);
  const serves = storedKeyServes(stored, userId, proj.url);
  if (serves && !storedKeyDueForRotation(stored!, Date.now())) return;
  // Due for rotation: the old key keeps working until the new one is written
  // (issuing revokes this install's previous key on the server).
  if (stored && !serves) {
    // Someone else's key, or another project's: retire it first.
    await selfRevoke(stored);
    await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss)).catch(() => {});
  }

  const install = await deviceId(ss);
  const { data, error } = await supabase.functions.invoke("capture-key", {
    body: { deviceId: install, deviceLabel: deviceLabel() },
  });
  // Offline, or the function isn't deployed yet: try again on the next
  // return to the app.
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
  await ss.setItemAsync(
    CAPTURE_KEY_ITEM,
    encodeStoredCaptureKey({ key, userId, ...proj, issuedAt: Date.now() }),
    options(ss)
  );
  lastIssued = { userId, at: Date.now() };
}

/**
 * Sign-out, while the session is still valid (the capture-key function needs
 * it): revokes the user's keys on the server. `"all"` for the app's global
 * sign-out, which ends every device's session, so every device's key goes
 * too (a lost phone's key must not outlive its session); `"device"` for only
 * this install's. If that request fails (offline, usually the same moment
 * global sign-out falls back to local), this phone's key revokes itself,
 * which needs no session. The request and that fallback share one
 * REQUEST_TIMEOUT_MS between them, and a request that timed out gets no
 * fallback (the network isn't answering, and the server revokes the keys
 * when the session ends anyway), so sign-out waits at most that long.
 * Never throws. The server also revokes every key when a user's last session ends
 * (20261125000000_capture_keys.sql), which covers a global sign-out whose
 * revoke request didn't land.
 */
export async function revokeCaptureKey(scope: CaptureKeyRevokeScope): Promise<void> {
  const ss = secureStore();
  if (!ss) return;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  const left = () => deadline - Date.now();
  try {
    const install = await ss.getItemAsync(CAPTURE_DEVICE_ITEM, options(ss)).catch(() => null);
    const body = captureKeyRevokeBody(scope, install);
    if (body) {
      const res = await withTimeout(
        supabase.functions.invoke("capture-key", { method: "DELETE", body }),
        Math.max(left(), 0)
      );
      if (res === "timeout") return;
      if (!res.error) return;
    }
    const stored = await readStored(ss);
    if (stored && left() > 0) await selfRevoke(stored, left());
  } catch {
    // Best effort: clearCaptureKey still empties the keychain.
  }
}

/** Removes the key from this phone (per-user teardown). Never throws. */
export async function clearCaptureKey(): Promise<void> {
  generation++;
  lastIssued = null;
  const ss = secureStore();
  if (!ss) return;
  await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss)).catch(() => {});
}

/**
 * There's no session (it ended, or never started on this launch): any key in
 * the keychain leaves it first, so the intent can't use it, then revokes
 * itself on the server (best effort; a key that misses this still expires
 * after 90 days). Also stops a key request still in flight from writing.
 * Idempotent and never throws.
 */
export async function discardCaptureKey(): Promise<void> {
  generation++;
  lastIssued = null;
  const ss = secureStore();
  if (!ss) return;
  try {
    const stored = await readStored(ss);
    if (!stored) return;
    // Only if it's still the same key: someone may have signed in meanwhile
    // and been issued their own.
    if ((await readStored(ss))?.key === stored.key) {
      await ss.deleteItemAsync(CAPTURE_KEY_ITEM, options(ss));
    }
    await selfRevoke(stored);
  } catch {
    // The next launch without a session tries again.
  }
}
