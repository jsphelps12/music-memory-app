// Runs under the root Vitest suite (`npm test`). web/tsconfig.json excludes
// __tests__ because the web project doesn't install vitest.
import { describe, expect, it } from "vitest";
import {
  latestAddedAt,
  mapAlbumMomentRows,
  memberContributorIds,
  type AlbumMomentRow,
} from "../albumMoments";

const URL = "https://proj.supabase.co";

function row(overrides: Partial<AlbumMomentRow> & { moment?: Partial<NonNullable<AlbumMomentRow["moments"]>> }): AlbumMomentRow {
  const { moment, ...rest } = overrides;
  return {
    added_at: "2026-10-01T10:00:00+00:00",
    added_by_user_id: "user-a",
    moments: {
      id: "m1",
      song_title: "Song",
      song_artist: "Artist",
      song_artwork_url: "https://art/1.jpg",
      song_preview_url: null,
      photo_urls: null,
      reflection_text: null,
      moment_date: "2026-09-30",
      mood: null,
      guest_name: null,
      guest_uuid: null,
      ...moment,
    },
    ...rest,
  };
}

describe("mapAlbumMomentRows", () => {
  it("carries mood through (it was dropped on two of the three pages)", () => {
    const [item] = mapAlbumMomentRows([row({ moment: { mood: "nostalgic" } })], new Map(), URL);
    expect(item.mood).toBe("nostalgic");
  });

  it("builds public photo URLs from storage paths", () => {
    const [item] = mapAlbumMomentRows([row({ moment: { photo_urls: ["u/a.jpg"] } })], new Map(), URL);
    expect(item.photoUrls).toEqual([`${URL}/storage/v1/object/public/moment-photos/u/a.jpg`]);
  });

  it("names guests by guest_name and members by profile, then the fallback", () => {
    const rows = [
      row({ added_by_user_id: "guest-acct", moment: { id: "g", guest_uuid: "x", guest_name: "Sarah" } }),
      row({ added_by_user_id: "user-a", moment: { id: "a" } }),
      row({ added_by_user_id: "user-b", moment: { id: "b" } }),
    ];
    const names = new Map([["user-a", "Alex"]]);
    expect(mapAlbumMomentRows(rows, names, URL).map((m) => m.contributorName)).toEqual(["Sarah", "Alex", null]);
    expect(mapAlbumMomentRows(rows, names, URL, "Owner").map((m) => m.contributorName)).toEqual([
      "Sarah",
      "Alex",
      "Owner",
    ]);
  });

  it("skips rows whose moment is missing", () => {
    expect(mapAlbumMomentRows([row({ moments: null })], new Map(), URL)).toEqual([]);
  });
});

describe("memberContributorIds", () => {
  it("dedupes and leaves out guest rows", () => {
    const rows = [
      row({ added_by_user_id: "user-a" }),
      row({ added_by_user_id: "user-a" }),
      row({ added_by_user_id: "guest-acct", moment: { guest_uuid: "x" } }),
      row({ added_by_user_id: null }),
    ];
    expect(memberContributorIds(rows)).toEqual(["user-a"]);
  });
});

describe("latestAddedAt", () => {
  const rows = [row({ added_at: "2026-10-01T00:00:00Z" }), row({ added_at: "2026-10-02T00:00:00Z" })];
  it("reads the newest end for either sort order", () => {
    expect(latestAddedAt(rows, "asc")).toBe("2026-10-02T00:00:00Z");
    expect(latestAddedAt([...rows].reverse(), "desc")).toBe("2026-10-02T00:00:00Z");
    expect(latestAddedAt([], "desc")).toBeNull();
  });
});
