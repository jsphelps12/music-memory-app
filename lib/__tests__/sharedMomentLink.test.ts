/**
 * Opening a /m/{token} link signed in: the RPC result mapping, the fallback
 * for a server without the RPC, and "couldn't check" vs "no such link".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));

import {
  isMissingRpcError,
  mapOpenSharedMoment,
  markShareTokenOpened,
  openSharedMoment,
  wasShareTokenOpened,
} from "../sharedMomentLink";

beforeEach(() => {
  sb.reset();
  (sb.client.rpc as ReturnType<typeof vi.fn>).mockClear();
});

const viewRow = {
  id: "m1",
  is_owner: false,
  song_title: "September",
  song_artist: "Earth, Wind & Fire",
  song_album_name: null,
  song_artwork_url: "https://example.com/a.jpg",
  song_preview_url: null,
  song_apple_music_id: "123",
  reflection_text: "Kitchen dancing.",
  photo_urls: ["u/a.jpg"],
  photo_thumbnails: ["u/thumb_a.jpg"],
  moment_date: "2026-07-04",
  mood: "joyful",
  moods: null,
  location: "Denver",
  sender_name: "Ola",
  sender_avatar_url: "u/avatar.jpg",
  sender_friend_token: "ftok",
};

describe("mapOpenSharedMoment", () => {
  it("null (unknown or malformed token) is not_found", () => {
    expect(mapOpenSharedMoment(null)).toEqual({ kind: "not_found" });
    expect(mapOpenSharedMoment({})).toEqual({ kind: "not_found" });
  });

  it("the owner gets the detail screen", () => {
    expect(mapOpenSharedMoment({ id: "m1", is_owner: true })).toEqual({ kind: "detail", id: "m1" });
  });

  it("maps the read-only projection, with the legacy single mood", () => {
    expect(mapOpenSharedMoment(viewRow)).toEqual({
      kind: "view",
      moment: {
        id: "m1",
        songTitle: "September",
        songArtist: "Earth, Wind & Fire",
        songAlbumName: null,
        songArtworkUrl: "https://example.com/a.jpg",
        songPreviewUrl: null,
        songAppleMusicId: "123",
        reflectionText: "Kitchen dancing.",
        photoUrls: ["u/a.jpg"],
        photoThumbnails: ["u/thumb_a.jpg"],
        momentDate: "2026-07-04",
        moods: ["joyful"],
        location: "Denver",
        senderName: "Ola",
        senderAvatarUrl: "u/avatar.jpg",
        senderFriendToken: "ftok",
      },
    });
  });

  it("prefers moods over mood and tolerates missing arrays", () => {
    const result = mapOpenSharedMoment({ ...viewRow, moods: ["calm", "warm"], photo_urls: null });
    expect(result.kind === "view" && result.moment.moods).toEqual(["calm", "warm"]);
    expect(result.kind === "view" && result.moment.photoUrls).toEqual([]);
  });
});

describe("isMissingRpcError", () => {
  it("matches PostgREST's and Postgres's missing-function codes only", () => {
    expect(isMissingRpcError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcError({ code: "42883" })).toBe(true);
    expect(isMissingRpcError({ code: "PGRST116" })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});

describe("openSharedMoment", () => {
  it("calls open_shared_moment with the token", async () => {
    sb.queueData(viewRow);
    const result = await openSharedMoment("tok");
    expect(sb.client.rpc).toHaveBeenCalledWith("open_shared_moment", { p_token: "tok" });
    expect(result.kind).toBe("view");
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__"]);
  });

  it("throws on a failed request instead of reporting the link as dead", async () => {
    sb.queueError({ message: "network request failed" });
    await expect(openSharedMoment("tok")).rejects.toMatchObject({ message: "network request failed" });
  });

  it("falls back to the old lookup when the RPC isn't deployed", async () => {
    sb.queueError({ message: "Could not find the function", code: "PGRST202" });
    sb.queueData({ id: "m9" });
    expect(await openSharedMoment("tok")).toEqual({ kind: "detail", id: "m9" });
    expect(sb.queries[1].table).toBe("moments");
  });

  it("fallback: no row or a malformed token is not_found", async () => {
    sb.queueError({ message: "missing", code: "42883" });
    sb.queueData(null);
    expect(await openSharedMoment("tok")).toEqual({ kind: "not_found" });

    sb.queueError({ message: "missing", code: "42883" });
    sb.queueError({ message: "invalid input syntax for type uuid", code: "22P02" });
    expect(await openSharedMoment("bad")).toEqual({ kind: "not_found" });
  });
});

describe("opened-token hand-off", () => {
  it("records tokens the screen has opened", () => {
    expect(wasShareTokenOpened("t1")).toBe(false);
    markShareTokenOpened("t1");
    expect(wasShareTokenOpened("t1")).toBe(true);
  });
});
