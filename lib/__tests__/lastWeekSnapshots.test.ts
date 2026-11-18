import { describe, expect, it } from "vitest";
import {
  compactCounts,
  countsFromLibrary,
  createSnapshotStore,
  LEGACY_SNAPSHOTS_KEY,
  legacyWeeksToKeep,
  snapshotKey,
  weekOfSnapshotKey,
  weeksToDrop,
  type SnapshotStorage,
} from "../lastWeekSnapshots";

function fakeStorage(initial: Record<string, string> = {}, { failSetFor }: { failSetFor?: (k: string) => boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const storage: SnapshotStorage = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      if (failSetFor?.(k)) throw new Error("disk full");
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
    getAllKeys: async () => [...data.keys()],
  };
  return { storage, data };
}

describe("pure helpers", () => {
  it("leaves out songs never played", () => {
    expect(compactCounts({ a: 3, b: 0, c: 1 })).toEqual({ a: 3, c: 1 });
    expect(countsFromLibrary([{ persistentId: "a", playCount: 0 }, { persistentId: "b", playCount: 7 }])).toEqual({ b: 7 });
  });

  it("round-trips week keys", () => {
    expect(weekOfSnapshotKey(snapshotKey("2026-11-09"))).toBe("2026-11-09");
    expect(weekOfSnapshotKey(LEGACY_SNAPSHOTS_KEY)).toBeNull();
    expect(weekOfSnapshotKey("lastweek_seen_v1")).toBeNull();
  });

  it("drops all but the newest weeks", () => {
    expect(weeksToDrop(["2026-11-16", "2026-11-02", "2026-11-09"], 2)).toEqual(["2026-11-02"]);
    expect(weeksToDrop(["2026-11-16"], 2)).toEqual([]);
    expect(weeksToDrop(["2025-12-29", "2026-01-05", "2026-01-12"], 2)).toEqual(["2025-12-29"]);
  });

  it("keeps the newest weeks of the old value, compacted", () => {
    const legacy = {
      "2026-10-19": { a: 1 },
      "2026-10-26": { a: 2 },
      "2026-11-02": { a: 3 },
      "2026-11-09": { a: 4, z: 0 },
      "2026-11-16": { a: 5 },
    };
    expect(legacyWeeksToKeep(legacy, 2)).toEqual({ "2026-11-09": { a: 4 }, "2026-11-16": { a: 5 } });
  });

  it("treats garbage as nothing to keep", () => {
    expect(legacyWeeksToKeep(null)).toEqual({});
    expect(legacyWeeksToKeep([1, 2])).toEqual({});
    expect(legacyWeeksToKeep({ "2026-11-09": "nope", "2026-11-16": { a: 1 } })).toEqual({ "2026-11-16": { a: 1 } });
  });
});

describe("createSnapshotStore", () => {
  const legacyValue = JSON.stringify({
    "2026-10-26": { old: 1 },
    "2026-11-02": { old: 2 },
    "2026-11-09": { a: 10, b: 0 },
    "2026-11-16": { a: 12 },
  });

  it("moves the newest weeks out of the old key, then removes it", async () => {
    const { storage, data } = fakeStorage({ [LEGACY_SNAPSHOTS_KEY]: legacyValue });
    const store = createSnapshotStore(storage, 2);
    expect(await store.read("2026-11-16")).toEqual({ a: 12 });
    expect(await store.read("2026-11-09")).toEqual({ a: 10 });
    expect(await store.read("2026-11-02")).toBeNull();
    expect(data.has(LEGACY_SNAPSHOTS_KEY)).toBe(false);
    expect([...data.keys()].sort()).toEqual([snapshotKey("2026-11-09"), snapshotKey("2026-11-16")]);
  });

  it("keeps the old key, and still reads from it, when moving fails", async () => {
    const { storage, data } = fakeStorage(
      { [LEGACY_SNAPSHOTS_KEY]: legacyValue },
      { failSetFor: (k) => k === snapshotKey("2026-11-16") }
    );
    const store = createSnapshotStore(storage, 2);
    expect(await store.read("2026-11-16")).toEqual({ a: 12 });
    expect(data.has(LEGACY_SNAPSHOTS_KEY)).toBe(true);
    // Nothing may be recorded over a baseline still in the old key.
    await expect(store.has("2026-11-16")).rejects.toThrow();
    await expect(store.write("2026-11-16", { a: 99 })).rejects.toThrow();
    expect(data.get(LEGACY_SNAPSHOTS_KEY)).toBe(legacyValue);
  });

  it("retries the move on a later call", async () => {
    let failing = true;
    const { storage, data } = fakeStorage({ [LEGACY_SNAPSHOTS_KEY]: legacyValue }, { failSetFor: () => failing });
    const store = createSnapshotStore(storage, 2);
    await expect(store.has("2026-11-16")).rejects.toThrow();
    failing = false;
    expect(await store.has("2026-11-16")).toBe(true);
    expect(data.has(LEGACY_SNAPSHOTS_KEY)).toBe(false);
  });

  it("never overwrites a week already in its own key", async () => {
    const { storage } = fakeStorage({
      [LEGACY_SNAPSHOTS_KEY]: legacyValue,
      [snapshotKey("2026-11-16")]: JSON.stringify({ a: 11 }),
    });
    const store = createSnapshotStore(storage, 2);
    expect(await store.read("2026-11-16")).toEqual({ a: 11 });
  });

  it("drops a corrupt old value", async () => {
    const { storage, data } = fakeStorage({ [LEGACY_SNAPSHOTS_KEY]: "{not json" });
    const store = createSnapshotStore(storage, 2);
    expect(await store.has("2026-11-16")).toBe(false);
    expect(data.has(LEGACY_SNAPSHOTS_KEY)).toBe(false);
  });

  it("writes a week compacted and keeps only the newest weeks", async () => {
    const { storage, data } = fakeStorage({
      [snapshotKey("2026-11-02")]: "{}",
      [snapshotKey("2026-11-09")]: JSON.stringify({ a: 1 }),
      lastweek_seen_v1: '"2026-11-09"',
    });
    const store = createSnapshotStore(storage, 2);
    expect(await store.has("2026-11-16")).toBe(false);
    await store.write("2026-11-16", { a: 4, b: 0 });
    expect(await store.has("2026-11-16")).toBe(true);
    expect(JSON.parse(data.get(snapshotKey("2026-11-16"))!)).toEqual({ a: 4 });
    expect(data.has(snapshotKey("2026-11-02"))).toBe(false);
    expect(data.has(snapshotKey("2026-11-09"))).toBe(true);
    expect(data.has("lastweek_seen_v1")).toBe(true); // other keys untouched
  });

  it("reads a missing or unreadable week as null", async () => {
    const { storage } = fakeStorage({ [snapshotKey("2026-11-09")]: "[1,2]" });
    const store = createSnapshotStore(storage, 2);
    expect(await store.read("2026-11-16")).toBeNull();
    expect(await store.read("2026-11-09")).toBeNull();
  });
});
