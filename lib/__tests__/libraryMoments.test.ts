import { describe, expect, it } from "vitest";
import {
  BULK_DAY_THRESHOLD,
  bulkDays,
  candidateSongs,
  dayKey,
  pairingLine,
  pairingScore,
  photoWindow,
} from "../libraryMoments";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const song = (id: string, dateAdded: number, playCount = 0) => ({
  persistentId: id,
  title: `Song ${id}`,
  artistName: "Artist",
  dateAdded,
  playCount,
});

describe("dayKey", () => {
  it("is the local calendar day", () => {
    expect(dayKey(at(2019, 6, 3, 23))).toBe("2019-06-03");
    expect(dayKey(at(2019, 12, 31, 0))).toBe("2019-12-31");
  });
});

describe("bulkDays", () => {
  it("finds days a sync or import stamped many songs with", () => {
    const sync = Array.from({ length: BULK_DAY_THRESHOLD + 5 }, (_, i) => song(`s${i}`, at(2018, 1, 10, 9)));
    const normal = [song("a", at(2019, 6, 3)), song("b", at(2019, 6, 3)), song("c", at(2020, 1, 1))];
    expect(bulkDays([...sync, ...normal])).toEqual([{ day: "2018-01-10", count: BULK_DAY_THRESHOLD + 5 }]);
  });

  it("doesn't count a day at the threshold", () => {
    const day = Array.from({ length: BULK_DAY_THRESHOLD }, (_, i) => song(`s${i}`, at(2018, 1, 10)));
    expect(bulkDays(day)).toEqual([]);
  });
});

describe("candidateSongs", () => {
  const now = at(2026, 11, 16);

  it("leaves out recent songs and bulk days, most played first", () => {
    const sync = Array.from({ length: BULK_DAY_THRESHOLD + 1 }, (_, i) => song(`s${i}`, at(2018, 1, 10), 500));
    const songs = [
      ...sync,
      song("old-quiet", at(2019, 6, 3), 3),
      song("old-loved", at(2020, 2, 1), 140),
      song("recent", at(2026, 10, 30), 999),
    ];
    expect(candidateSongs(songs, now, 10).map((s) => s.persistentId)).toEqual(["old-loved", "old-quiet"]);
  });

  it("caps the list", () => {
    const songs = Array.from({ length: 5 }, (_, i) => song(`x${i}`, at(2019, 1, 1 + i), i));
    expect(candidateSongs(songs, now, 2)).toHaveLength(2);
  });
});

describe("photoWindow", () => {
  it("covers three whole days either side", () => {
    const { from, to } = photoWindow(at(2019, 6, 3, 15));
    expect(from).toBe(new Date(2019, 4, 31).getTime());
    expect(to).toBe(new Date(2019, 5, 7).getTime());
  });
});

describe("pairingScore", () => {
  it("is zero without photos", () => {
    expect(pairingScore(0, 500)).toBe(0);
  });

  it("weighs photos above plays", () => {
    expect(pairingScore(14, 3)).toBeGreaterThan(pairingScore(3, 14));
  });
});

describe("pairingLine", () => {
  it("reads as a sentence", () => {
    expect(pairingLine("Holocene", at(2019, 6, 3), 14)).toBe(
      "You added Holocene June 3, 2019, the week of these 14 photos."
    );
    expect(pairingLine("Holocene", at(2019, 6, 3), 1)).toBe(
      "You added Holocene June 3, 2019, the week of this photo."
    );
  });
});
