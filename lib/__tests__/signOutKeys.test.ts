/**
 * Signing out must leave nothing of one person's From before, Last week,
 * photo analyses, nudge questions or capture hint for the next account on
 * the phone. Those records aren't keyed by user id and their key names are
 * private to their files, so lib/signOutKeys.ts repeats them; this suite
 * reads the owning files and fails when a key there isn't in the list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
  ...storage,
}));

const { SIGN_OUT_KEYS, clearSignOutKeys } = await import("../signOutKeys");

/** Files whose device-local records aren't keyed by user id. */
const OWNERS = [
  "lib/pastPairingsData.ts",
  "lib/lastWeekData.ts",
  "lib/photoAnalysisStore.ts",
  "lib/nudgeQuestionStore.ts",
  "lib/captureHint.ts",
];

/** `const SOME_KEY = "name_v1";` style storage keys in a source file. */
function storageKeysIn(file: string): string[] {
  const src = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  return [...src.matchAll(/const\s+\w*KEY\w*\s*=\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("SIGN_OUT_KEYS", () => {
  it.each(OWNERS)("covers every storage key in %s", (file) => {
    const keys = storageKeysIn(file);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(SIGN_OUT_KEYS).toContain(key);
  });

  it("has no duplicates", () => {
    expect(new Set(SIGN_OUT_KEYS).size).toBe(SIGN_OUT_KEYS.length);
  });
});

describe("clearSignOutKeys", () => {
  beforeEach(() => storage.reset());

  it("removes the listed keys and leaves device-wide ones alone", async () => {
    for (const key of SIGN_OUT_KEYS) storage.seed(key, "x");
    storage.seed("app_lock_enabled", "1");
    storage.seed("has_launched", "true");
    await clearSignOutKeys();
    for (const key of SIGN_OUT_KEYS) expect(storage.map.has(key)).toBe(false);
    expect(storage.map.get("app_lock_enabled")).toBe("1");
    expect(storage.map.get("has_launched")).toBe("true");
  });

  it("never throws", async () => {
    storage.multiRemove.mockRejectedValueOnce(new Error("disk"));
    await expect(clearSignOutKeys()).resolves.toBeUndefined();
  });
});
