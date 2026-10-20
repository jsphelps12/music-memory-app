/**
 * Album membership changes for one moment: the add/remove diff, and folding
 * a partial save back so it keeps what did succeed. (The membership read,
 * fetchAlbumIdsContainingMoment, is tested in albums.test.ts.)
 */
import { describe, it, expect } from "vitest";

import { applyMembershipResults, diffAlbumMembership } from "../momentAlbums";

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
