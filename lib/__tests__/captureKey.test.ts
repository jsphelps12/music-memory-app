/**
 * The capture key's app side: coming back to the app re-checks it at most
 * every CAPTURE_KEY_RECHECK_MS once it's there (a failed request is tried
 * again next time), the label is generic, and sign-out's revoke and its
 * fallback share one time budget.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";

vi.mock("react-native", () => ({ Platform: { OS: "ios", isPad: false } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "install-0001" }));
vi.mock("@sentry/react-native", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));

const keychain = new Map<string, string>();
const secureStore = {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (k: string) => keychain.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => void keychain.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void keychain.delete(k)),
};
// captureKey.ts loads expo-secure-store with require(); put the fake in
// Node's require cache under that name.
const req = createRequire(import.meta.url);
let secureStorePath: string | null = null;
try {
  secureStorePath = req.resolve("expo-secure-store");
  req.cache[secureStorePath] = { exports: secureStore } as never;
} catch {}

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }) },
  },
}));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

const KEY = `stc_${"a".repeat(43)}`;
const mod = await import("../captureKey");
const { CAPTURE_KEY_ITEM } = await import("../captureKeyPayload");

const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
vi.stubGlobal("fetch", fetchMock);

beforeEach(async () => {
  await mod.clearCaptureKey();
  keychain.clear();
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: { key: KEY }, error: null });
});

describe.skipIf(!secureStorePath)("capture key", () => {
  it("asks with a generic label, not the phone's name", async () => {
    await mod.ensureCaptureKey("user-1");
    expect(invoke).toHaveBeenCalledWith("capture-key", { body: { deviceId: "install-0001", deviceLabel: "iPhone" } });
    expect(keychain.has(CAPTURE_KEY_ITEM)).toBe(true);
  });

  it("re-checks on return to the app at most every 10 minutes once the key is there", async () => {
    const t0 = Date.now();
    await mod.ensureCaptureKeyOnResume("user-1", t0);
    expect(invoke).toHaveBeenCalledTimes(1);
    secureStore.getItemAsync.mockClear();
    await mod.ensureCaptureKeyOnResume("user-1", t0 + 60_000);
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    // The intent deleted a key the server refused: the next check after the window issues one.
    keychain.delete(CAPTURE_KEY_ITEM);
    await mod.ensureCaptureKeyOnResume("user-1", Date.now() + mod.CAPTURE_KEY_RECHECK_MS + 1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("tries a failed request again on the very next return to the app", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("offline") });
    const t0 = Date.now();
    await mod.ensureCaptureKeyOnResume("user-1", t0);
    expect(keychain.has(CAPTURE_KEY_ITEM)).toBe(false);
    await mod.ensureCaptureKeyOnResume("user-1", t0 + 1000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(keychain.has(CAPTURE_KEY_ITEM)).toBe(true);
  });

  it("sign-out's revoke gets no self-revoke fallback once it timed out", async () => {
    await mod.ensureCaptureKey("user-1");
    vi.useFakeTimers();
    invoke.mockImplementation(() => new Promise(() => {}));
    const done = mod.revokeCaptureKey("all");
    await vi.advanceTimersByTimeAsync(4000);
    await done;
    vi.useRealTimers();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the key revoking itself when the request fails fast", async () => {
    await mod.ensureCaptureKey("user-1");
    invoke.mockResolvedValue({ data: null, error: new Error("401") });
    await mod.revokeCaptureKey("all");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
