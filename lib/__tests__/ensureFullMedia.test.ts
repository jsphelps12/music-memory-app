/**
 * lib/ensureFullMedia.ts: before a moment leaves its owner, its linked
 * photos' originals go up once, even when two shares start together, and a
 * failed run leaves nothing behind in the bucket.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});

const uploads: string[] = [];
const deleted: string[][] = [];
let uploadGate: Promise<void> = Promise.resolve();

vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@sentry/react-native", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock("expo-media-library/legacy", () => ({
  getAssetInfoAsync: vi.fn(async (id: string) => ({ localUri: `file:///${id}.heic` })),
}));
vi.mock("@/modules/now-playing", () => ({
  localIdsFor: vi.fn(async (cloudIds: string[]) => Object.fromEntries(cloudIds.map((c) => [c, `local-${c}`]))),
}));
vi.mock("@/lib/storage", () => ({
  uploadMomentFullPhoto: vi.fn(async (userId: string, uri: string) => {
    await uploadGate;
    const path = `${userId}/full-${uploads.length + 1}.jpg`;
    uploads.push(uri);
    return path;
  }),
  deleteMomentPhotos: vi.fn(async (paths: string[]) => {
    deleted.push(paths);
    return paths;
  }),
}));

const { ensureFullMedia } = await import("../ensureFullMedia");

const ME = "user-1";
const linkedRow = {
  id: "m1",
  user_id: ME,
  photo_urls: ["user-1/thumb-a.jpg", "user-1/thumb-b.jpg"],
  media_refs: [
    { cloudId: "a", kind: "photo", full: false },
    { cloudId: "b", kind: "photo", full: false },
  ],
};

beforeEach(() => {
  sb.reset();
  uploads.length = 0;
  deleted.length = 0;
  uploadGate = Promise.resolve();
});

describe("ensureFullMedia", () => {
  it("uploads each linked photo's original and records it", async () => {
    sb.queueData(linkedRow);
    sb.queueData([{ id: "m1" }]);
    await expect(ensureFullMedia("m1", ME)).resolves.toEqual({ uploaded: 2, missing: 0 });
    expect(uploads).toHaveLength(2);
    const update = sb.queries[1].chain.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({
      photo_urls: ["user-1/full-1.jpg", "user-1/full-2.jpg"],
      media_refs: [
        { cloudId: "a", full: true },
        { cloudId: "b", full: true },
      ],
    });
    expect(deleted).toEqual([]);
  });

  it("two shares at once upload the originals once and both get the result", async () => {
    let open!: () => void;
    uploadGate = new Promise((r) => (open = r));
    sb.queueData(linkedRow);
    sb.queueData([{ id: "m1" }]);
    const first = ensureFullMedia("m1", ME);
    const second = ensureFullMedia("m1", ME);
    expect(second).toBe(first);
    open();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { uploaded: 2, missing: 0 },
      { uploaded: 2, missing: 0 },
    ]);
    expect(uploads).toHaveLength(2);
    expect(sb.queries.filter((q) => q.chain.some((c) => c.method === "update"))).toHaveLength(1);
  });

  it("a later share starts a fresh run (and finds nothing left to upload)", async () => {
    sb.queueData(linkedRow);
    sb.queueData([{ id: "m1" }]);
    await ensureFullMedia("m1", ME);
    sb.queueData({
      ...linkedRow,
      photo_urls: ["user-1/full-1.jpg", "user-1/full-2.jpg"],
      media_refs: linkedRow.media_refs.map((r) => ({ ...r, full: true })),
    });
    await expect(ensureFullMedia("m1", ME)).resolves.toEqual({ uploaded: 0, missing: 0 });
    expect(uploads).toHaveLength(2);
  });

  it("different moments don't share a run", async () => {
    sb.queueData(linkedRow);
    sb.queueData({ ...linkedRow, id: "m2" });
    sb.queueData([{ id: "m1" }]);
    sb.queueData([{ id: "m2" }]);
    const one = ensureFullMedia("m1", ME);
    const two = ensureFullMedia("m2", ME);
    expect(two).not.toBe(one);
    await Promise.all([one, two]);
    expect(uploads).toHaveLength(4);
  });

  it("removes what it uploaded when the row update fails, and the next try runs again", async () => {
    sb.queueData(linkedRow);
    sb.queueError("update failed");
    await expect(ensureFullMedia("m1", ME)).rejects.toMatchObject({ message: "update failed" });
    expect(deleted).toEqual([["user-1/full-1.jpg", "user-1/full-2.jpg"]]);

    sb.queueData(linkedRow);
    sb.queueData([{ id: "m1" }]);
    await expect(ensureFullMedia("m1", ME)).resolves.toEqual({ uploaded: 2, missing: 0 });
  });

  it("removes what it uploaded when the moment is gone by the time it's recorded", async () => {
    sb.queueData(linkedRow);
    sb.queueData([]);
    await expect(ensureFullMedia("m1", ME)).rejects.toThrow();
    expect(deleted).toEqual([["user-1/full-1.jpg", "user-1/full-2.jpg"]]);
  });

  it("does nothing for someone else's moment", async () => {
    sb.queueData({ ...linkedRow, user_id: "someone-else" });
    await expect(ensureFullMedia("m1", ME)).resolves.toEqual({ uploaded: 0, missing: 0 });
    expect(uploads).toEqual([]);
  });
});
