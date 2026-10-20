/**
 * Friend-link helpers: the invite-token lookup goes through the RPC, a failed
 * lookup is an error (not "invalid link"), only an accepted row means
 * connected, username checks match literally, and the edge function's typed
 * errors are read from the non-2xx body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted with the vi.mock below, which runs before plain top-level consts.
const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { ...sb.client, functions: { invoke } } }));

import {
  acceptFriendInvite,
  checkUsernameAvailable,
  escapeLikePattern,
  fetchProfileByFriendToken,
  friendInviteErrorCode,
  isConnected,
} from "../friends";

beforeEach(() => {
  sb.reset();
  invoke.mockReset();
});

describe("fetchProfileByFriendToken", () => {
  it("looks the token up through get_profile_by_invite_token", async () => {
    sb.queueData([{ id: "o1", display_name: "Ola", avatar_url: null, username: "ola" }]);
    const result = await fetchProfileByFriendToken("tok");
    expect(sb.client.rpc).toHaveBeenCalledWith("get_profile_by_invite_token", { p_token: "tok" });
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__"]);
    expect(result).toEqual({ id: "o1", displayName: "Ola", avatarUrl: null, username: "ola" });
  });

  it("returns null when no profile has the token", async () => {
    sb.queueData([]);
    expect(await fetchProfileByFriendToken("nope")).toBeNull();
  });

  it("throws on a failed request instead of reporting an invalid link", async () => {
    sb.queueError("Network request failed");
    await expect(fetchProfileByFriendToken("tok")).rejects.toMatchObject({ message: "Network request failed" });
  });
});

describe("isConnected", () => {
  it("only counts accepted friendships", () => {
    expect(isConnected("accepted")).toBe(true);
    expect(isConnected("pending")).toBe(false);
    expect(isConnected("declined")).toBe(false);
    expect(isConnected(null)).toBe(false);
  });
});

describe("username availability", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLikePattern("jo_n")).toBe("jo\\_n");
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("plain")).toBe("plain");
  });

  it("queries with the escaped name", async () => {
    sb.queueData(null);
    expect(await checkUsernameAvailable("jo_n", "me")).toBe(true);
    expect(sb.queries[0].chain).toContainEqual({ method: "ilike", args: ["username", "jo\\_n"] });
  });

  it("throws on a failed request instead of reporting the name as free", async () => {
    sb.queueError("Network request failed");
    await expect(checkUsernameAvailable("john", "me")).rejects.toBeTruthy();
  });
});

describe("acceptFriendInvite", () => {
  it("reads typed errors from the non-2xx response body", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "not_found" }) } },
    });
    await expect(acceptFriendInvite("tok")).rejects.toThrow("not_found");

    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "non-2xx", context: { json: async () => ({ error: "self_request" }) } },
    });
    await expect(acceptFriendInvite("tok")).rejects.toThrow("self_request");
  });

  it("rethrows other failures unchanged", async () => {
    const networkError = new Error("Network request failed");
    invoke.mockResolvedValueOnce({ data: null, error: networkError });
    await expect(acceptFriendInvite("tok")).rejects.toBe(networkError);
  });

  it("resolves on success", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(acceptFriendInvite("tok")).resolves.toBeUndefined();
  });

  it("recognises only the known codes", () => {
    expect(friendInviteErrorCode({ error: "not_found" })).toBe("not_found");
    expect(friendInviteErrorCode({ error: "unauthorized" })).toBeNull();
    expect(friendInviteErrorCode(null)).toBeNull();
  });
});
