/**
 * Select mode's network side: addMomentsToAlbum (skip what's already there,
 * originals before a shared album, one insert) and deleteMoments (every
 * moment through the single-delete path, failures reported, not fatal).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
const ensureFullMedia = vi.hoisted(() => vi.fn(async () => ({ uploaded: 0, missing: 0 })));
const deleteMomentWithCleanup = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ensureFullMedia", () => ({
  ensureFullMedia,
  ensureFullMediaForMe: vi.fn(async () => {}),
  ensureFullMediaForAlbum: vi.fn(async () => {}),
  ensureFullMediaForAlbumMoments: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { multiRemove: vi.fn() } }));
vi.mock("@/lib/deleteMoment", () => ({ deleteMomentWithCleanup }));

import { addMomentsToAlbum } from "../albums";
import { deleteMoments } from "../deleteMoments";

beforeEach(() => {
  sb.reset();
  ensureFullMedia.mockClear();
  deleteMomentWithCleanup.mockReset();
});

describe("addMomentsToAlbum", () => {
  it("inserts only the moments not already in the album, in one insert", async () => {
    sb.queueData([{ moment_id: "m2" }]); // already in
    sb.queueData({ is_public: false });
    sb.queueData(null); // insert
    const res = await addMomentsToAlbum("c1", ["m1", "m2", "m3"], "u1");
    expect(res).toEqual({ added: ["m1", "m3"], skipped: ["m2"] });
    const insert = sb.queries[2];
    expect(insert.table).toBe("collection_moments");
    expect(insert.chain[0]).toEqual({
      method: "insert",
      args: [
        [
          { collection_id: "c1", moment_id: "m1", added_by_user_id: "u1" },
          { collection_id: "c1", moment_id: "m3", added_by_user_id: "u1" },
        ],
      ],
    });
    expect(ensureFullMedia).not.toHaveBeenCalled();
  });

  it("uploads linked originals first for a shared album", async () => {
    sb.queueData([]);
    sb.queueData({ is_public: true });
    sb.queueData(null);
    await addMomentsToAlbum("c1", ["m1", "m2"], "u1");
    expect(ensureFullMedia.mock.calls).toEqual([
      ["m1", "u1"],
      ["m2", "u1"],
    ]);
  });

  it("does nothing more when every moment is already there", async () => {
    sb.queueData([{ moment_id: "m1" }]);
    const res = await addMomentsToAlbum("c1", ["m1"], "u1");
    expect(res).toEqual({ added: [], skipped: ["m1"] });
    expect(sb.queries).toHaveLength(1);
  });

  it("throws when the insert fails", async () => {
    sb.queueData([]);
    sb.queueData({ is_public: false });
    sb.queueError("permission denied");
    await expect(addMomentsToAlbum("c1", ["m1"], "u1")).rejects.toBeTruthy();
  });
});

describe("deleteMoments", () => {
  it("deletes each through the single path and reports the failures", async () => {
    deleteMomentWithCleanup.mockImplementation(async (m: { id: string }) =>
      m.id === "b" ? { error: new Error("offline") } : { error: null }
    );
    const moments = ["a", "b", "c"].map((id) => ({ id, photoUrls: [`${id}.jpg`], photoThumbnails: [] }));
    const res = await deleteMoments(moments);
    expect(res.succeeded).toEqual(["a", "c"]);
    expect(res.failed).toEqual(["b"]);
    expect(deleteMomentWithCleanup).toHaveBeenCalledTimes(3);
    expect(deleteMomentWithCleanup).toHaveBeenCalledWith(moments[0]);
  });
});
