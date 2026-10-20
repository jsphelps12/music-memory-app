/**
 * Share-link minting and the "Shared with you" seen-marking. Both had the same
 * shape of bug: a write that quietly did less than the UI assumed (an update
 * that matched no row, an update that matched rows nobody had seen).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "new-token" }));

import {
  ensureShareToken,
  markSharesViewed,
  momentShareUrl,
  friendInviteUrl,
  unviewedShareIds,
} from "../momentShares";

beforeEach(() => {
  sb.reset();
});

const methods = (i: number) => sb.queries[i].chain.map((c) => c.method);

describe("ensureShareToken", () => {
  it("returns an existing token without writing", async () => {
    expect(await ensureShareToken("m1", "live-token")).toBe("live-token");
    expect(sb.queries).toHaveLength(0);
  });

  it("writes a new token only where none is set, and asks for the row back", async () => {
    sb.queueData([{ id: "m1" }]);
    expect(await ensureShareToken("m1", null)).toBe("new-token");
    expect(methods(0)).toEqual(["update", "eq", "is", "select"]);
    expect(sb.queries[0].chain[2].args).toEqual(["share_token", null]);
  });

  it("returns the live token when one already existed (no second token minted)", async () => {
    sb.queueData([]); // update matched nothing: share_token was not null
    sb.queueData({ share_token: "already-live" });
    expect(await ensureShareToken("m1", null)).toBe("already-live");
  });

  it("throws when the update matched no row and there is no token (not the owner)", async () => {
    sb.queueData([]);
    sb.queueData({ share_token: null });
    await expect(ensureShareToken("m1", undefined)).rejects.toThrow(/permission denied/);
  });

  it("throws the update error", async () => {
    sb.queueError("network request failed");
    await expect(ensureShareToken("m1", null)).rejects.toMatchObject({ message: "network request failed" });
  });
});

describe("momentShareUrl", () => {
  it("builds the public /m link", () => {
    expect(momentShareUrl("abc")).toBe("https://soundtracks.app/m/abc");
  });
});

describe("friendInviteUrl", () => {
  it("builds the public /friend link", () => {
    expect(friendInviteUrl("tok")).toBe("https://soundtracks.app/friend/tok");
  });
});

describe("unviewedShareIds", () => {
  it("returns only the shares not yet seen", () => {
    expect(
      unviewedShareIds([
        { shareId: "a", viewedAt: null },
        { shareId: "b", viewedAt: "2026-10-01T00:00:00Z" },
        { shareId: "c", viewedAt: null },
      ])
    ).toEqual(["a", "c"]);
  });
});

describe("markSharesViewed", () => {
  it("only marks the given shares", async () => {
    sb.queueData(null);
    await markSharesViewed("u1", ["a", "c"]);
    expect(methods(0)).toEqual(["update", "eq", "in", "is"]);
    expect(sb.queries[0].chain[2].args).toEqual(["id", ["a", "c"]]);
  });

  it("does nothing with no ids (never an unscoped update)", async () => {
    await markSharesViewed("u1", []);
    expect(sb.queries).toHaveLength(0);
  });

  it("throws on error", async () => {
    sb.queueError("boom");
    await expect(markSharesViewed("u1", ["a"])).rejects.toMatchObject({ message: "boom" });
  });
});
