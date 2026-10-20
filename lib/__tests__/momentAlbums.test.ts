/**
 * Album membership for one moment: read for every album the user can see (not
 * just owned ones), and a partial save keeps what did succeed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));

import {
  applyMembershipResults,
  diffAlbumMembership,
  fetchAlbumIdsContainingMoment,
} from "../momentAlbums";

beforeEach(() => sb.reset());

describe("fetchAlbumIdsContainingMoment", () => {
  it("reads collection_moments for the moment, deduped", async () => {
    sb.queueData([{ collection_id: "a" }, { collection_id: "b" }, { collection_id: "a" }]);
    expect(await fetchAlbumIdsContainingMoment("m1")).toEqual(["a", "b"]);
    expect(sb.queries[0].table).toBe("collection_moments");
    expect(sb.queries[0].chain[1]).toEqual({ method: "eq", args: ["moment_id", "m1"] });
  });

  it("throws on error instead of returning an empty membership", async () => {
    sb.queueError("network request failed");
    await expect(fetchAlbumIdsContainingMoment("m1")).rejects.toMatchObject({
      message: "network request failed",
    });
  });
});

describe("diffAlbumMembership", () => {
  it("splits into adds and removes", () => {
    expect(diffAlbumMembership(["a", "b"], ["b", "c"])).toEqual({ toAdd: ["c"], toRemove: ["a"] });
  });
});

describe("applyMembershipResults", () => {
  const ok: PromiseSettledResult<unknown> = { status: "fulfilled", value: undefined };
  const fail = (reason: unknown): PromiseSettledResult<unknown> => ({ status: "rejected", reason });

  it("applies every success", () => {
    const r = applyMembershipResults(["a"], ["b"], ["a"], [ok, ok]);
    expect(r.memberIds).toEqual(["b"]);
    expect(r.changedIds).toEqual(["b", "a"]);
    expect(r.error).toBeNull();
  });

  it("keeps successes and reports the first failure on a partial save", () => {
    const err = new Error("duplicate key");
    const r = applyMembershipResults(["a"], ["b", "c"], ["a"], [ok, fail(err), fail(new Error("2nd"))]);
    expect([...r.memberIds].sort()).toEqual(["a", "b"]);
    expect(r.changedIds).toEqual(["b"]);
    expect(r.error).toBe(err);
  });
});
