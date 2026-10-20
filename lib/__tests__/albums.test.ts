/**
 * lib/albums.ts: the row mapping, the shared-album activity counts, the
 * artwork picker, and the error contracts the album screens depend on. The
 * screens tell "this album/link is gone" apart from "the request failed" by
 * what these functions return or throw, so those branches are the ones worth
 * pinning down: getting them wrong shows an offline user a dead link or an
 * empty album.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Moment } from "@/types";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { ...sb.client, functions: { invoke } } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { multiRemove: vi.fn() } }));

import {
  AlbumNotFoundError,
  AlbumUnavailableError,
  albumCoverKey,
  buildAlbumActivity,
  compareAlbumMoments,
  deleteAlbum,
  ensureAlbumGuestUser,
  fetchAlbumArtworks,
  fetchAlbumByInviteCode,
  fetchAlbumDetail,
  joinAlbum,
  mapAlbumRow,
  pickAlbumArtworks,
  selectAlbumsPreview,
  updateAlbumCover,
  type AlbumRow,
} from "../albums";

beforeEach(() => {
  sb.reset();
  invoke.mockReset();
});

function row(overrides: Partial<AlbumRow> = {}): AlbumRow {
  return {
    id: "a1",
    user_id: "owner",
    name: "Road Trip",
    created_at: "2026-01-01T00:00:00Z",
    is_public: false,
    invite_code: "code1",
    cover_photo_url: null,
    collection_moments: [],
    ...overrides,
  };
}

describe("mapAlbumRow", () => {
  it("gives owned albums their moment ids and no owner name", () => {
    const album = mapAlbumRow(
      row({ collection_moments: [{ moment_id: "m1" }, { moment_id: "m2" }], cover_photo_url: "owner/c.jpg" }),
      "owner"
    );
    expect(album).toMatchObject({ id: "a1", role: "owner", momentCount: 2, momentIds: ["m1", "m2"], coverPhotoUrl: "owner/c.jpg" });
    expect(album.ownerName).toBeUndefined();
  });

  it("gives joined albums the owner's name and no moment ids", () => {
    const album = mapAlbumRow(row({ is_public: true, collection_moments: [{ moment_id: "m1" }] }), "member", "Sam");
    expect(album).toMatchObject({ role: "member", ownerName: "Sam", isPublic: true, momentCount: 1 });
    expect(album.momentIds).toBeUndefined();
  });

  it("maps nulls to undefined / false", () => {
    const album = mapAlbumRow(row({ is_public: null, invite_code: null, collection_moments: null }), "owner");
    expect(album).toMatchObject({ isPublic: false, inviteCode: undefined, coverPhotoUrl: undefined, momentCount: 0 });
  });
});

describe("buildAlbumActivity", () => {
  const owned = [
    row({
      id: "shared-owned",
      is_public: true,
      owner_last_viewed_at: "2026-02-01T00:00:00Z",
      collection_moments: [
        { moment_id: "m1", added_at: "2026-01-15T00:00:00Z" },
        { moment_id: "m2", added_at: "2026-02-10T00:00:00Z" },
      ],
    }),
    row({
      id: "personal",
      is_public: false,
      collection_moments: [{ moment_id: "m3", added_at: "2026-03-01T00:00:00Z" }],
    }),
  ];
  const joined = [
    row({
      id: "joined",
      user_id: "friend",
      is_public: true,
      collection_moments: [
        { moment_id: "m4", added_at: "2026-03-05T00:00:00Z" },
        { moment_id: "m5", added_at: "2026-03-06T00:00:00Z" },
      ],
    }),
    row({ id: "joined-empty", user_id: "friend", is_public: true, collection_moments: [] }),
  ];
  const members = [
    { collection_id: "joined", joined_at: "2026-03-01T00:00:00Z", last_viewed_at: "2026-03-05T12:00:00Z" },
    { collection_id: "joined-empty", joined_at: "2026-03-01T00:00:00Z", last_viewed_at: null },
  ];

  it("counts additions since the last visit, newest album first", () => {
    const activity = buildAlbumActivity(owned, joined, members, new Map([["friend", "Sam"]]));
    expect(activity.map((a) => [a.collectionId, a.newMomentCount])).toEqual([
      ["joined", 1],
      ["shared-owned", 1],
    ]);
    expect(activity[0]).toMatchObject({ role: "member", ownerName: "Sam", latestAddedAt: "2026-03-06T00:00:00Z" });
  });

  it("leaves out personal albums and empty joined albums", () => {
    const ids = buildAlbumActivity(owned, joined, members, new Map()).map((a) => a.collectionId);
    expect(ids).not.toContain("personal");
    expect(ids).not.toContain("joined-empty");
  });

  it("falls back to joined_at when a member never opened the album", () => {
    const [a] = buildAlbumActivity([], [joined[0]], [{ collection_id: "joined", joined_at: "2026-03-04T00:00:00Z" }], new Map());
    expect(a.newMomentCount).toBe(2);
  });
});

describe("selectAlbumsPreview", () => {
  it("puts albums with something new first, then the newest", () => {
    const albums = [
      mapAlbumRow(row({ id: "old", created_at: "2026-01-01T00:00:00Z" }), "owner"),
      mapAlbumRow(row({ id: "new", created_at: "2026-05-01T00:00:00Z" }), "owner"),
      mapAlbumRow(row({ id: "busy", created_at: "2025-01-01T00:00:00Z" }), "owner"),
    ];
    const result = selectAlbumsPreview({ albums, newCounts: { busy: 3 }, artworks: {} }, 2);
    expect(result.total).toBe(3);
    expect(result.preview.map((a) => a.id)).toEqual(["busy", "new"]);
  });
});

describe("pickAlbumArtworks", () => {
  it("keeps up to four distinct artworks per album in row order", () => {
    const art = (url: string | null) => ({ moments: { song_artwork_url: url } });
    const result = pickAlbumArtworks([
      { id: "a", collection_moments: [art("1"), art("1"), art(null), { moments: null }, art("2"), art("3"), art("4"), art("5")] },
      { id: "empty", collection_moments: [] },
    ]);
    expect(result).toEqual({ a: ["1", "2", "3", "4"] });
  });
});

describe("fetchAlbumArtworks", () => {
  it("limits the embedded rows per album on the server", async () => {
    sb.queueData([]);
    await fetchAlbumArtworks(["a", "b"]);
    const chain = sb.queries[0].chain;
    expect(sb.queries[0].table).toBe("collections");
    const limit = chain.find((c) => c.method === "limit");
    expect(limit?.args[1]).toEqual({ referencedTable: "collection_moments" });
  });

  it("skips the request when there are no albums", async () => {
    expect(await fetchAlbumArtworks([])).toEqual({});
    expect(sb.queries).toHaveLength(0);
  });
});

describe("compareAlbumMoments", () => {
  it("sorts newest first with undated moments last", () => {
    const m = (id: string, momentDate: string | null, createdAt = "2026-01-01T00:00:00Z") =>
      ({ id, momentDate, createdAt }) as Moment;
    const sorted = [m("undated", null), m("old", "2024-05-01"), m("new", "2026-05-01"), m("new-later", "2026-05-01", "2026-06-01T00:00:00Z")]
      .sort(compareAlbumMoments)
      .map((x) => x.id);
    expect(sorted).toEqual(["new-later", "new", "old", "undated"]);
  });
});

describe("albumCoverKey", () => {
  it("gives every upload a new name under the album id", () => {
    expect(albumCoverKey("a1", 1000)).not.toBe(albumCoverKey("a1", 2000));
    expect(albumCoverKey("a1", 1000).startsWith("a1-")).toBe(true);
  });
});

describe("fetchAlbumByInviteCode", () => {
  it("returns null when no shared album has the code", async () => {
    sb.queueData(null);
    expect(await fetchAlbumByInviteCode("nope")).toBeNull();
  });

  it("throws on a failed lookup instead of calling the link dead", async () => {
    sb.queueError("Network request failed");
    await expect(fetchAlbumByInviteCode("code1")).rejects.toMatchObject({ message: "Network request failed" });
  });

  it("keeps the preview when the owner's name can't be read", async () => {
    sb.queueData({ id: "a1", user_id: "owner", name: "Road Trip", is_public: true, invite_code: "code1", collection_moments: [{ moment_id: "m1" }] });
    sb.queueError("permission denied");
    expect(await fetchAlbumByInviteCode("code1")).toMatchObject({ id: "a1", ownerName: null, momentCount: 1 });
  });
});

describe("joinAlbum", () => {
  const preview = { id: "a1", user_id: "owner", name: "Road Trip", is_public: true, invite_code: "code1", collection_moments: [] };

  it("reports an album that can no longer be joined", async () => {
    sb.queueData(preview);
    sb.queueData([{ id: "owner", display_name: "Sam" }]);
    sb.queueError({ message: "new row violates row-level security policy", code: "42501" });
    await expect(joinAlbum("code1", "me")).rejects.toBeInstanceOf(AlbumUnavailableError);
  });

  it("reports a code that no longer matches a shared album", async () => {
    sb.queueData(null);
    await expect(joinAlbum("code1", "me")).rejects.toBeInstanceOf(AlbumUnavailableError);
  });

  it("treats already being a member as success", async () => {
    sb.queueData(preview);
    sb.queueData([{ id: "owner", display_name: "Sam" }]);
    sb.queueError({ message: "duplicate key value", code: "23505" });
    await expect(joinAlbum("code1", "me")).resolves.toMatchObject({ id: "a1", role: "member", userId: "owner", ownerName: "Sam" });
  });

  it("passes other failures through for the screen to show", async () => {
    sb.queueData(preview);
    sb.queueData([]);
    sb.queueError("Network request failed");
    await expect(joinAlbum("code1", "me")).rejects.not.toBeInstanceOf(AlbumUnavailableError);
  });
});

describe("fetchAlbumDetail", () => {
  it("throws the request error, not 'not found', when the lookup fails", async () => {
    sb.queueError("Network request failed");
    sb.queueData(null);
    const err = await fetchAlbumDetail("a1", "me").catch((e) => e);
    expect(err).not.toBeInstanceOf(AlbumNotFoundError);
    expect(err.message).toBe("Network request failed");
  });

  it("is not found when the album is gone", async () => {
    sb.queueData(null);
    sb.queueData(null);
    await expect(fetchAlbumDetail("a1", "me")).rejects.toBeInstanceOf(AlbumNotFoundError);
  });

  it("is not found for a shared album the user isn't in", async () => {
    sb.queueData(row({ is_public: true }));
    sb.queueData(null);
    await expect(fetchAlbumDetail("a1", "me")).rejects.toBeInstanceOf(AlbumNotFoundError);
  });

  it("fails rather than showing an empty album when the moments query fails", async () => {
    sb.queueData(row({ user_id: "me" }));
    sb.queueData(null);
    sb.queueError("Network request failed");
    const err = await fetchAlbumDetail("a1", "me").catch((e) => e);
    expect(err.message).toBe("Network request failed");
  });

  it("loads a personal album's moments through its collection rows", async () => {
    sb.queueData(row({ user_id: "me" }));
    sb.queueData(null);
    sb.queueData([
      { moments: { id: "m1", user_id: "me", moment_date: "2025-01-01", created_at: "2025-01-01T00:00:00Z" } },
      { moments: null },
      { moments: { id: "m2", user_id: "me", moment_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" } },
    ]);
    const { album, moments } = await fetchAlbumDetail("a1", "me");
    expect(album).toMatchObject({ role: "owner", momentCount: 2, momentIds: ["m2", "m1"] });
    expect(moments.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(sb.queries[2].table).toBe("collection_moments");
  });

  it("loads a joined shared album through the RPC with the owner's name", async () => {
    sb.queueData(row({ is_public: true }));
    sb.queueData({ collection_id: "a1" });
    sb.queueData([{ id: "m1", user_id: "owner", moment_date: "2026-01-01", contributor_name: "Sam" }]);
    sb.queueData([{ id: "owner", display_name: "Sam" }]);
    const { album, moments } = await fetchAlbumDetail("a1", "me");
    expect(album).toMatchObject({ role: "member", ownerName: "Sam", momentCount: 1 });
    expect(moments[0].contributorName).toBe("Sam");
  });
});

describe("covers", () => {
  it("deletes the replaced cover after the album points at the new one", async () => {
    sb.queueData(null);
    await updateAlbumCover("a1", "owner/collection_covers/a1-2.jpg", "owner/collection_covers/a1.jpg");
    expect(sb.storage.remove).toHaveBeenCalledWith(["owner/collection_covers/a1.jpg"]);
  });

  it("deletes the cover when it's removed", async () => {
    sb.queueData(null);
    await updateAlbumCover("a1", null, "owner/collection_covers/a1.jpg");
    expect(sb.storage.remove).toHaveBeenCalledWith(["owner/collection_covers/a1.jpg"]);
  });

  it("keeps the old cover when the update fails", async () => {
    sb.queueError("Network request failed");
    await expect(updateAlbumCover("a1", null, "owner/collection_covers/a1.jpg")).rejects.toBeTruthy();
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });

  it("deletes an album's cover with the album", async () => {
    sb.queueData({ guest_user_id: null });
    sb.queueData([{ cover_photo_url: "owner/collection_covers/a1.jpg" }]);
    await deleteAlbum("a1");
    expect(sb.storage.remove).toHaveBeenCalledWith(["owner/collection_covers/a1.jpg"]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("leaves storage alone when the album delete fails", async () => {
    sb.queueData({ guest_user_id: null });
    sb.queueError("permission denied");
    await expect(deleteAlbum("a1")).rejects.toBeTruthy();
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });

  it("cleans up guest contributions before deleting an album with a guest user", async () => {
    invoke.mockResolvedValue({ data: { ok: true, deleted: 2 }, error: null });
    sb.queueData({ guest_user_id: "g1" });
    sb.queueData([{ cover_photo_url: null }]);
    await deleteAlbum("a1");
    expect(invoke).toHaveBeenCalledWith("delete-guest-moments", { body: { collectionId: "a1" } });
    expect(sb.queries.map((q) => q.chain.some((c) => c.method === "delete"))).toEqual([false, true]);
  });

  it("keeps the album when the guest cleanup fails, so it can be retried", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Edge Function returned a non-2xx status code") });
    sb.queueData({ guest_user_id: "g1" });
    await expect(deleteAlbum("a1")).rejects.toThrow("non-2xx");
    expect(sb.queries).toHaveLength(1);
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });
});

describe("ensureAlbumGuestUser", () => {
  it("throws when the function call fails (invoke doesn't throw on its own)", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Edge Function returned a non-2xx status code") });
    await expect(ensureAlbumGuestUser("a1")).rejects.toThrow("non-2xx");
  });

  it("resolves when the guest user exists or was created", async () => {
    invoke.mockResolvedValue({ data: { guestUserId: "g1" }, error: null });
    await expect(ensureAlbumGuestUser("a1")).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("create-guest-user", { body: { collectionId: "a1" } });
  });
});
