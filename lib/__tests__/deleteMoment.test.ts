/**
 * A moment's delete takes its storage objects with it: its photos, and its
 * voice recording (whose path card rows don't carry, so the delete returns
 * it). Guest moments are deleted by the delete-guest-moments edge function,
 * never from the client, and its typed failures reach the user as readable
 * errors.
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
vi.mock("@/lib/timelineRefresh", () => ({ markTimelineDeleted: vi.fn() }));

import { deleteGuestMoment, deleteMomentWithCleanup, guestDeleteErrorMessage } from "../deleteMoment";
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

describe("deleteMomentWithCleanup", () => {
  const card = { id: "m1", photoUrls: ["u1/a.jpg"], photoThumbnails: ["u1/thumb_a.jpg"] };
  const removedFrom = (bucket: string) =>
    sb.storage.remove.mock.calls.filter((_, i) => sb.storage.buckets[i] === bucket).map((c) => c[0]);

  it("deletes the row, then the photos and the recording the delete handed back", async () => {
    sb.queueData([{ voice_path: "u1/m1-1.m4a" }]);
    expect(await deleteMomentWithCleanup(card)).toEqual({ error: null });

    expect(sb.queries[0].chain.map((c) => c.method)).toEqual(["delete", "eq", "select"]);
    expect(sb.queries[0].chain[2].args).toEqual(["voice_path"]);
    await Promise.resolve();
    expect(sb.storage.buckets).toEqual(["moment-photos", "moment-voice"]);
    expect(removedFrom("moment-voice")).toEqual([["u1/m1-1.m4a"]]);
  });

  it("uses the recording path the screen already has too", async () => {
    sb.queueData([]);
    await deleteMomentWithCleanup({ ...card, voicePath: "u1/m1-1.m4a" });
    await Promise.resolve();
    expect(removedFrom("moment-voice")).toEqual([["u1/m1-1.m4a"]]);
  });

  it("touches no recording when the moment had none", async () => {
    sb.queueData([{ voice_path: null }]);
    await deleteMomentWithCleanup(card);
    await Promise.resolve();
    expect(sb.storage.buckets).toEqual(["moment-photos"]);
  });

  it("on a database without the voice columns, deletes the row the plain way", async () => {
    sb.queueError({ code: "42703", message: 'column moments.voice_path does not exist' });
    sb.queueData(null);
    expect(await deleteMomentWithCleanup(card)).toEqual({ error: null });
    expect(sb.queries.map((q) => q.chain.map((c) => c.method))).toEqual([
      ["delete", "eq", "select"],
      ["delete", "eq"],
    ]);
  });

  it("a failed delete removes nothing from storage", async () => {
    sb.queueError("network");
    const { error } = await deleteMomentWithCleanup({ ...card, voicePath: "u1/m1-1.m4a" });
    expect(error).toMatchObject({ message: "network" });
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });
});
