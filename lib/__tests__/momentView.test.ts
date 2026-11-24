/**
 * The shared view on the device: who may pass a moment on, what a non-owner
 * sees, and which read the detail screen and the inbox use (the shaped RPCs,
 * with the old table reads only for a server without them).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@/lib/ensureFullMedia", () => ({
  ensureFullMedia: vi.fn(async () => ({ uploaded: 0, missing: 0 })),
  ensureFullMediaForMe: vi.fn(async () => {}),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

import { canPassOn, fetchMomentForViewer, mapMomentView, shapeForViewer } from "../momentView";
import { fetchSharedWithMe, mapShareRow } from "../momentShares";

const rpc = sb.client.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  sb.reset();
  rpc.mockClear();
});

/** A full moments row, as the owner reads it. */
function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    user_id: "owner",
    song_title: "September",
    song_artist: "Earth, Wind & Fire",
    reflection_text: "Kitchen dancing.",
    photo_urls: ["owner/a.jpg"],
    photo_thumbnails: ["owner/thumb_a.jpg"],
    media_refs: [],
    moods: ["joyful"],
    people: ["Sam", "Alex"],
    location: "Provo, UT",
    location_lat: 40.23,
    location_lng: -111.66,
    share_token: "live-token",
    moment_date: "2026-07-04",
    created_at: "2026-07-04T22:00:00Z",
    updated_at: "2026-07-04T22:00:00Z",
    ...overrides,
  };
}

/** The same moment as get_moment_view returns it to someone else. */
function sharedRow(overrides: Record<string, unknown> = {}) {
  const { share_token: _token, ...rest } = ownerRow();
  return {
    ...rest,
    location: null,
    location_lat: null,
    location_lng: null,
    people: [],
    owner_display_name: "Josh",
    owner_avatar_url: "owner/avatar.jpg",
    ...overrides,
  };
}

describe("canPassOn", () => {
  it("is true only for the owner", () => {
    expect(canPassOn({ userId: "owner" }, "owner")).toBe(true);
    expect(canPassOn({ userId: "owner" }, "friend")).toBe(false);
  });

  it("is false with no moment or no signed-in user", () => {
    expect(canPassOn(null, "owner")).toBe(false);
    expect(canPassOn(undefined, "owner")).toBe(false);
    expect(canPassOn({ userId: "owner" }, null)).toBe(false);
    expect(canPassOn({ userId: undefined }, undefined)).toBe(false);
  });
});

describe("shapeForViewer", () => {
  it("leaves the owner's moment as it is", () => {
    const own = mapMomentView(ownerRow(), "owner");
    expect(shapeForViewer(own, "owner")).toBe(own);
    expect(own.people).toEqual(["Sam", "Alex"]);
    expect(own.locationLat).toBe(40.23);
    expect(own.shareToken).toBe("live-token");
  });

  it("hides place, people and the link token from anyone else", () => {
    const shaped = shapeForViewer(mapMomentView(ownerRow(), "owner"), "friend");
    expect(shaped.location).toBeNull();
    expect(shaped.locationLat).toBeNull();
    expect(shaped.locationLng).toBeNull();
    expect(shaped.people).toEqual([]);
    expect(shaped.shareToken).toBeNull();
    // What the shared view keeps.
    expect(shaped.reflectionText).toBe("Kitchen dancing.");
    expect(shaped.photoUrls).toEqual(["owner/a.jpg"]);
    expect(shaped.moods).toEqual(["joyful"]);
  });
});

describe("mapMomentView", () => {
  it("maps a shaped row with the hidden fields empty, and attributes it to the owner", () => {
    const m = mapMomentView(sharedRow(), "friend");
    expect(m.location).toBeNull();
    expect(m.locationLat).toBeNull();
    expect(m.people).toEqual([]);
    expect(m.shareToken).toBeNull();
    expect(m.contributorName).toBe("Josh");
  });

  it("keeps a guest's own name over the owner's", () => {
    const m = mapMomentView(sharedRow({ guest_uuid: "g1", guest_name: "Aunt Carol" }), "friend");
    expect(m.contributorName).toBe("Aunt Carol");
  });

  it("doesn't attribute the owner's own moment", () => {
    expect(mapMomentView(ownerRow(), "owner").contributorName).toBeUndefined();
  });
});

describe("fetchMomentForViewer", () => {
  it("reads someone else's moment through get_moment_view", async () => {
    sb.queueData(sharedRow());
    const m = await fetchMomentForViewer("m1", "friend", false);
    expect(rpc).toHaveBeenCalledWith("get_moment_view", { p_moment_id: "m1" });
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__"]);
    expect(m?.people).toEqual([]);
    expect(m?.location).toBeNull();
  });

  it("returns null when the view says no access", async () => {
    sb.queueData(null);
    expect(await fetchMomentForViewer("m1", "stranger", false)).toBeNull();
  });

  it("re-reads the viewer's own moment from the table", async () => {
    sb.queueData(ownerRow());
    const m = await fetchMomentForViewer("m1", "owner", true);
    expect(rpc).not.toHaveBeenCalled();
    expect(sb.queries[0].table).toBe("moments");
    expect(m?.shareToken).toBe("live-token");
  });

  it("gives the owner the full row through the view too", async () => {
    sb.queueData(ownerRow());
    const m = await fetchMomentForViewer("m1", "owner", false);
    expect(m?.people).toEqual(["Sam", "Alex"]);
    expect(m?.location).toBe("Provo, UT");
  });

  it("throws a failed request", async () => {
    sb.queueError({ message: "network request failed" });
    await expect(fetchMomentForViewer("m1", "friend", false)).rejects.toMatchObject({
      message: "network request failed",
    });
  });

  it("falls back to the table on a server without the view, shaped on the device", async () => {
    sb.queueError({ message: "Could not find the function", code: "PGRST202" });
    sb.queueData(ownerRow());
    const m = await fetchMomentForViewer("m1", "friend", false);
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__", "moments"]);
    expect(m?.people).toEqual([]);
    expect(m?.locationLat).toBeNull();
    expect(m?.shareToken).toBeNull();
  });
});

describe("fetchSharedWithMe", () => {
  const inboxRow = {
    id: "share-1",
    sender_id: "owner",
    created_at: "2026-08-01T10:00:00Z",
    viewed_at: null,
    sender_name: "Josh",
    sender_avatar_url: null,
    moments: sharedRow(),
  };

  it("reads the inbox through get_shared_with_me", async () => {
    sb.queueData([inboxRow]);
    const items = await fetchSharedWithMe("friend");
    expect(rpc).toHaveBeenCalledWith("get_shared_with_me");
    expect(items).toHaveLength(1);
    expect(items[0].shareId).toBe("share-1");
    expect(items[0].moment.contributorName).toBe("Josh");
    expect(items[0].moment.people).toEqual([]);
  });

  it("falls back to the table embed on a server without it, shaped on the device", async () => {
    sb.queueError({ message: "missing", code: "42883" });
    sb.queueData([{ ...inboxRow, moments: ownerRow() }]);
    sb.queueData([{ id: "owner", display_name: "Josh" }]);
    const items = await fetchSharedWithMe("friend");
    expect(sb.queries.map((q) => q.table)).toEqual(["__rpc__", "moment_shares", "profiles"]);
    expect(items[0].moment.people).toEqual([]);
    expect(items[0].moment.location).toBeNull();
    expect(items[0].moment.contributorName).toBe("Josh");
  });

  it("throws other errors", async () => {
    sb.queueError({ message: "network request failed" });
    await expect(fetchSharedWithMe("friend")).rejects.toMatchObject({ message: "network request failed" });
  });
});

describe("mapShareRow with a viewer", () => {
  it("shapes the moment for the recipient", () => {
    const shared = mapShareRow({ id: "s1", sender_id: "owner", moments: ownerRow() }, "Josh", "friend");
    expect(shared.moment.people).toEqual([]);
    expect(shared.moment.shareToken).toBeNull();
  });
});
