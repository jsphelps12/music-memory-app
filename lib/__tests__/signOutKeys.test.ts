/**
 * Signing out must leave nothing of one person's From before, Last week,
 * photo analyses, nudge questions, capture hint or parked links for the
 * next account on the phone. Those records aren't keyed by user id and their key names are
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

// lib/outbox.ts's file side is native; only its key names matter here.
vi.mock("../outboxFiles", () => ({}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "id" }));

const { SIGN_OUT_KEYS, SIGN_OUT_PREFIXES, clearSignOutKeys, isSignOutKey } = await import("../signOutKeys");

/** Files whose device-local records aren't keyed by user id. */
const OWNERS = [
  "lib/pastPairings.ts",
  "lib/lastWeekData.ts",
  "lib/lastWeekSnapshots.ts",
  "lib/photoAnalysisStore.ts",
  "lib/nudgeQuestionStore.ts",
  "lib/captureHint.ts",
  "hooks/useDeepLinkHandler.ts",
];

/** Keys in those files that belong to the device, not the person. */
const DEVICE_WIDE = new Set(["has_launched"]);

/** `const SOME_KEY = "name_v1";` style storage keys in a source file. */
function storageKeysIn(file: string): string[] {
  const src = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  const single = [...src.matchAll(/const\s+\w*KEY\w*\s*=\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  // `const LEGACY_…_KEYS = ["a", "b"]` lists.
  const lists = [...src.matchAll(/const\s+\w*KEYS\w*\s*=\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1])
  );
  return [...single, ...lists];
}

describe("SIGN_OUT_KEYS", () => {
  it.each(OWNERS)("covers every storage key in %s", (file) => {
    const keys = storageKeysIn(file).filter((k) => !DEVICE_WIDE.has(k));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(SIGN_OUT_KEYS).toContain(key);
  });

  it("covers per-account From before keys and weekly snapshots by prefix", () => {
    expect(isSignOutKey("frombefore_picks_v5_user-1")).toBe(true);
    expect(isSignOutKey("frombefore_dismissed_v2_user-2")).toBe(true);
    expect(isSignOutKey("lastweek_playcounts_v2:2026-11-16")).toBe(true);
    expect(isSignOutKey("app_lock_enabled")).toBe(false);
    expect(isSignOutKey("first_moment_saved_user-1")).toBe(false);
  });

  it("the prefixes match the keys their owners build", async () => {
    const { fromBeforeKeys } = await import("../pastPairings");
    const { snapshotKey } = await import("../lastWeekSnapshots");
    for (const key of Object.values(fromBeforeKeys("u1"))) expect(isSignOutKey(key)).toBe(true);
    expect(isSignOutKey(snapshotKey("2026-11-16"))).toBe(true);
  });

  it("covers the outbox of moments waiting to save", async () => {
    const { outboxKey, OUTBOX_KEY_PREFIX } = await import("../outbox");
    expect(isSignOutKey(outboxKey("u1"))).toBe(true);
    expect(SIGN_OUT_PREFIXES).toContain(OUTBOX_KEY_PREFIX);
  });

  it("keeps the device-wide keys", () => {
    for (const key of DEVICE_WIDE) expect(isSignOutKey(key)).toBe(false);
  });

  it("covers the deep links parked for after sign-in", () => {
    expect(isSignOutKey("pending_invite_code")).toBe(true);
    expect(isSignOutKey("pending_friend_token")).toBe(true);
    expect(isSignOutKey("pending_share_token")).toBe(true);
  });

  it("has no duplicates", () => {
    expect(new Set(SIGN_OUT_KEYS).size).toBe(SIGN_OUT_KEYS.length);
  });
});

describe("clearSignOutKeys", () => {
  beforeEach(() => storage.reset());

  it("removes the listed keys and leaves device-wide ones alone", async () => {
    for (const key of SIGN_OUT_KEYS) storage.seed(key, "x");
    storage.seed("frombefore_picks_v5_u1", "x");
    storage.seed("lastweek_playcounts_v2:2026-11-16", "x");
    storage.seed("app_lock_enabled", "1");
    storage.seed("has_launched", "true");
    await clearSignOutKeys();
    for (const key of SIGN_OUT_KEYS) expect(storage.map.has(key)).toBe(false);
    expect(storage.map.has("frombefore_picks_v5_u1")).toBe(false);
    expect(storage.map.has("lastweek_playcounts_v2:2026-11-16")).toBe(false);
    expect(storage.map.get("app_lock_enabled")).toBe("1");
    expect(storage.map.get("has_launched")).toBe("true");
  });

  it("never throws", async () => {
    storage.multiRemove.mockRejectedValueOnce(new Error("disk"));
    await expect(clearSignOutKeys()).resolves.toBeUndefined();
  });
});
