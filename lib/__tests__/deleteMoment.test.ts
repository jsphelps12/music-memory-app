/**
 * Guest moments are deleted by the delete-guest-moments edge function, never
 * from the client, and its typed failures reach the user as readable errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { ...sb.client, functions: { invoke } } }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
vi.mock("expo-image-manipulator", () => ({ manipulateAsync: vi.fn(), SaveFormat: { JPEG: "jpeg" } }));

import { deleteGuestMoment, guestDeleteErrorMessage } from "../deleteMoment";
import { friendlyError } from "../errors";

beforeEach(() => {
  sb.reset();
  invoke.mockReset();
});

const non2xx = (body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { json: async () => body },
});

describe("deleteGuestMoment", () => {
  it("calls the edge function and never deletes the row itself", async () => {
    invoke.mockResolvedValue({ data: { ok: true, deleted: 1 }, error: null });
    expect(await deleteGuestMoment("m1")).toEqual({ error: null });
    expect(invoke).toHaveBeenCalledWith("delete-guest-moments", { body: { momentId: "m1" } });
    expect(sb.queries).toHaveLength(0);
  });

  it("maps a forbidden body to a permission message", async () => {
    invoke.mockResolvedValue({ data: null, error: non2xx({ error: "forbidden" }) });
    const { error } = await deleteGuestMoment("m1");
    expect(friendlyError(error)).toBe("You don't have permission to do that.");
  });

  it("passes other failures through (photo cleanup failed is retryable)", async () => {
    const fnError = non2xx({ error: "cleanup_failed" });
    invoke.mockResolvedValue({ data: null, error: fnError });
    const { error } = await deleteGuestMoment("m1");
    expect(error).toBe(fnError);
  });
});

describe("guestDeleteErrorMessage", () => {
  it("knows forbidden and not_found only", () => {
    expect(guestDeleteErrorMessage({ error: "forbidden" })).toBe("permission denied");
    expect(guestDeleteErrorMessage({ error: "not_found" })).toBe("no rows found");
    expect(guestDeleteErrorMessage({ error: "cleanup_failed" })).toBeNull();
    expect(guestDeleteErrorMessage(null)).toBeNull();
  });
});
