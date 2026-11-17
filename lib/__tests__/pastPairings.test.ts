import { describe, expect, it } from "vitest";
import type { LibraryTrack } from "../lastWeek";
import {
  addedOnLabel,
  collapseAdds,
  fromBeforeCandidates,
  median,
  onThisDaySongs,
  photosLine,
  pickFromBefore,
  playsLine,
  relativeScore,
  yearsAgo,
  type PastSong,
} from "../pastPairings";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 17, 9);

function track(over: Partial<LibraryTrack> & { persistentId: string }): LibraryTrack {
  return {
    storeId: `s${over.persistentId}`,
    title: `Song ${over.persistentId}`,
    artistName: "Artist",
    dateAdded: at(2020, 1, 1),
    playCount: 1,
    ...over,
  };
}

function past(day: string, plays = 1): PastSong {
  return { key: day, storeId: day, title: day, artistName: "A", albumTitle: "", day, at: 0, plays };
}

describe("collapseAdds", () => {
  it("makes an album add one row, led by its most played track", () => {
    const album = [1, 2, 3].map((n) => track({ persistentId: `a${n}`, albumId: "9", dateAdded: at(2024, 8, 8), playCount: n * 10 }));
    const rows = collapseAdds(album);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "sa3", albumTracks: 3, day: "2024-08-08" });
  });
});

describe("onThisDaySongs", () => {
  it("finds songs added on today's date in earlier years, most played first", () => {
    const lib = [
      track({ persistentId: "x", dateAdded: at(2024, 11, 17, 20), playCount: 5 }),
      track({ persistentId: "y", dateAdded: at(2021, 11, 17), playCount: 50 }),
      track({ persistentId: "today", dateAdded: at(2026, 11, 17, 8) }),
      track({ persistentId: "other", dateAdded: at(2024, 11, 18) }),
    ];
    expect(onThisDaySongs(lib, NOW).map((s) => s.key)).toEqual(["sy", "sx"]);
  });

  it("labels how long ago", () => {
    expect(yearsAgo(at(2025, 11, 17), NOW)).toBe("1 year ago");
    expect(yearsAgo(at(2021, 11, 17), NOW)).toBe("5 years ago");
  });
});

describe("fromBeforeCandidates", () => {
  it("takes old songs, one per day, skipping shown and saved ones", () => {
    const lib = [
      track({ persistentId: "a", dateAdded: at(2024, 8, 8), playCount: 90 }),
      track({ persistentId: "b", dateAdded: at(2024, 8, 8, 18), playCount: 80 }),
      track({ persistentId: "c", dateAdded: at(2023, 3, 1), playCount: 70 }),
      track({ persistentId: "d", dateAdded: at(2026, 10, 1), playCount: 99 }), // too recent
      track({ persistentId: "e", dateAdded: at(2022, 5, 5), playCount: 60 }),
    ];
    const got = fromBeforeCandidates(lib, NOW, new Set(["se"]));
    expect(got.map((s) => s.key)).toEqual(["sa", "sc"]);
  });
});

describe("scoring", () => {
  it("scores photos against the usual week", () => {
    expect(median([1, 9, 3])).toBe(3);
    expect(median([2, 4])).toBe(3);
    expect(relativeScore(0, 5, 100)).toBe(0);
    // A 70-photo trip beats a 6-photo week, same plays.
    expect(relativeScore(70, 6, 10)).toBeGreaterThan(relativeScore(6, 6, 10));
  });

  it("picks the strongest spikes, one per month", () => {
    // Usual week: 6 photos, so a pick needs at least 9.
    const picks = pickFromBefore([
      { song: past("2024-08-08", 89), photos: 70 },
      { song: past("2024-08-20", 50), photos: 40 }, // same month as the trip
      { song: past("2023-03-01", 10), photos: 12 },
      { song: past("2022-05-05", 99), photos: 0 },
      { song: past("2021-01-02", 5), photos: 6 }, // an ordinary week
      { song: past("2020-04-04", 5), photos: 5 },
      { song: past("2019-02-02", 5), photos: 3 },
    ]);
    expect(picks.map((p) => p.song.day)).toEqual(["2024-08-08", "2023-03-01"]);
  });

  it("returns nothing when no week stands out", () => {
    expect(pickFromBefore([3, 4, 5, 4].map((n, i) => ({ song: past(`202${i}-01-01`), photos: n })))).toEqual([]);
  });
});

describe("copy", () => {
  it("words the lines", () => {
    expect(addedOnLabel(at(2019, 6, 3))).toBe("Added June 3, 2019");
    expect(photosLine(14, "week")).toBe("the week of 14 photos");
    expect(photosLine(1, "day")).toBe("1 photo that day");
    expect(photosLine(0, "week")).toBe("");
    expect(playsLine(89)).toBe("played 89 times");
    expect(playsLine(1)).toBe("played once");
  });
});
