import { describe, expect, it } from "vitest";
import {
  buildWeekSongs,
  currentWeek,
  groupByDay,
  lastWeekRange,
  lastWeekRowState,
  songReasonLine,
  weekHasContent,
  weekLabel,
  weeklyPlays,
  weekPhotosView,
  photosOfDays,
  type LibraryTrack,
  type StreamedTrack,
} from "../lastWeek";

// Local times, so the tests hold in any time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

// Monday Nov 9 – Sunday Nov 15, 2026.
const week = { start: at(2026, 11, 9, 0), end: at(2026, 11, 16, 0), key: "2026-11-09" };

function track(over: Partial<LibraryTrack> & { persistentId: string }): LibraryTrack {
  return {
    storeId: `s${over.persistentId}`,
    title: `Song ${over.persistentId}`,
    artistName: "Artist",
    dateAdded: at(2025, 1, 1),
    playCount: 1,
    ...over,
  };
}

describe("week ranges", () => {
  it("before Sunday evening recaps the week that ended last Sunday", () => {
    expect(lastWeekRange(at(2026, 11, 18))).toEqual(week); // the Wednesday after
    expect(lastWeekRange(at(2026, 11, 22, 9))).toEqual(week); // the Sunday after, morning
  });

  it("from Sunday evening recaps the week that's ending", () => {
    expect(lastWeekRange(at(2026, 11, 15, 19))).toEqual(week);
    expect(lastWeekRange(at(2026, 11, 22, 19))).toEqual(currentWeek(at(2026, 11, 18)));
  });

  it("labels the week", () => {
    expect(weekLabel(week)).toBe("Nov 9–15");
    const across = { start: at(2026, 12, 28, 0), end: at(2027, 1, 4, 0), key: "2026-12-28" };
    expect(weekLabel(across)).toBe("Dec 28 – Jan 3");
  });
});

describe("weeklyPlays", () => {
  it("is the difference from the week's start", () => {
    expect(weeklyPlays({ persistentId: "a", playCount: 20 }, { a: 12 }, null)).toBe(8);
    expect(weeklyPlays({ persistentId: "a", playCount: 20 }, { a: 12 }, { a: 15 })).toBe(3);
  });

  it("counts a song new since the start from zero", () => {
    expect(weeklyPlays({ persistentId: "b", playCount: 4 }, { a: 1 }, null)).toBe(4);
  });

  it("reads a song missing from the end snapshot as never played (snapshots leave those out)", () => {
    expect(weeklyPlays({ persistentId: "b", playCount: 9 }, { a: 1 }, { a: 2 })).toBe(0);
    expect(weeklyPlays({ persistentId: "a", playCount: 9 }, {}, { a: 5 })).toBe(5);
  });

  it("is unknown without a start", () => {
    expect(weeklyPlays({ persistentId: "a", playCount: 20 }, null, null)).toBeNull();
  });
});

describe("buildWeekSongs", () => {
  it("collapses an album add into one row led by the most played track", () => {
    const album = [1, 2, 3, 4].map((n) =>
      track({ persistentId: `al${n}`, albumId: "77", albumTitle: "Blond", dateAdded: at(2026, 11, 12, 20), playCount: n === 3 ? 9 : 1 })
    );
    const songs = buildWeekSongs({ week, library: album, streamed: [], countsAtStart: null, countsAtEnd: null });
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ key: "sal3", reason: "added", albumTracks: 4, day: "2026-11-12" });
    expect(songReasonLine(songs[0])).toBe("Added with 3 others from Blond");
  });

  it("keeps two songs from one album as two rows", () => {
    const two = [1, 2].map((n) => track({ persistentId: `t${n}`, albumId: "5", dateAdded: at(2026, 11, 11) }));
    expect(buildWeekSongs({ week, library: two, streamed: [], countsAtStart: null, countsAtEnd: null })).toHaveLength(2);
  });

  it("leaves out a day that looks like a sync", () => {
    const sync = Array.from({ length: 30 }, (_, n) =>
      track({ persistentId: `y${n}`, albumId: `a${n}`, dateAdded: at(2026, 11, 13) })
    );
    expect(buildWeekSongs({ week, library: sync, streamed: [], countsAtStart: null, countsAtEnd: null })).toEqual([]);
  });

  it("ignores songs added outside the week", () => {
    const old = [track({ persistentId: "o", dateAdded: at(2026, 11, 8, 23) })];
    expect(buildWeekSongs({ week, library: old, streamed: [], countsAtStart: null, countsAtEnd: null })).toEqual([]);
  });

  it("lists played songs most played first, weekly when known", () => {
    const lib = [
      track({ persistentId: "p1", lastPlayed: at(2026, 11, 14), playCount: 40 }),
      track({ persistentId: "p2", lastPlayed: at(2026, 11, 15), playCount: 30 }),
      track({ persistentId: "p3", lastPlayed: at(2026, 11, 15), playCount: 10 }),
    ];
    const songs = buildWeekSongs({
      week,
      library: lib,
      streamed: [],
      countsAtStart: { p1: 39, p2: 20, p3: 4 },
      countsAtEnd: null,
    });
    // p1 had one play this week: below "a lot".
    expect(songs.map((s) => s.key)).toEqual(["sp2", "sp3"]);
    expect(songReasonLine(songs[0])).toBe("Played 10 times");
  });

  it("falls back to lifetime counts without a start", () => {
    const lib = [
      track({ persistentId: "p1", lastPlayed: at(2026, 11, 14), playCount: 5 }),
      track({ persistentId: "p2", lastPlayed: at(2026, 11, 15), playCount: 50 }),
    ];
    const songs = buildWeekSongs({ week, library: lib, streamed: [], countsAtStart: null, countsAtEnd: null });
    expect(songs.map((s) => s.key)).toEqual(["sp2", "sp1"]);
    expect(songReasonLine(songs[0])).toBe("Played this week");
  });

  it("doesn't list a song twice when it was added and played", () => {
    const lib = [track({ persistentId: "x", dateAdded: at(2026, 11, 11), lastPlayed: at(2026, 11, 15), playCount: 9 })];
    const songs = buildWeekSongs({ week, library: lib, streamed: [], countsAtStart: null, countsAtEnd: null });
    expect(songs).toHaveLength(1);
    expect(songs[0].reason).toBe("added");
  });

  it("adds streamed songs that aren't in the library, once each", () => {
    const streamed: StreamedTrack[] = [
      { storeId: "999", title: "Streamed", artistName: "A", firstSeen: at(2026, 11, 13) },
      { storeId: "999", title: "Streamed", artistName: "A", firstSeen: at(2026, 11, 14) },
      { storeId: "sin", title: "In library", artistName: "A", firstSeen: at(2026, 11, 13) },
      { storeId: "old", title: "Before", artistName: "A", firstSeen: at(2026, 11, 2) },
    ];
    const lib = [track({ persistentId: "in", storeId: "sin" })];
    const songs = buildWeekSongs({ week, library: lib, streamed, countsAtStart: null, countsAtEnd: null });
    expect(songs.map((s) => [s.key, s.reason, s.day])).toEqual([["999", "streamed", "2026-11-14"]]);
    expect(songReasonLine(songs[0])).toBe("Played on Apple Music");
  });
});

describe("groupByDay", () => {
  it("puts songs and photos under their day, newest day first", () => {
    const songs = buildWeekSongs({
      week,
      library: [track({ persistentId: "a", dateAdded: at(2026, 11, 11) })],
      streamed: [],
      countsAtStart: null,
      countsAtEnd: null,
    });
    const photos = [
      { id: "p2", uri: "ph://2", createdAt: at(2026, 11, 15, 18) },
      { id: "p1", uri: "ph://1", createdAt: at(2026, 11, 15, 9) },
    ];
    const days = groupByDay(songs, photos);
    expect(days.map((d) => d.key)).toEqual(["2026-11-15", "2026-11-11"]);
    expect(days[0].photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(days[1].songs).toHaveLength(1);
  });
});

describe("the Journal row", () => {
  const base = { week, access: "granted" as const, askDismissed: false, dismissedWeek: null, hasContent: true };

  it("shows for a week with something in it", () => {
    expect(lastWeekRowState(base)).toBe("row");
    expect(weekHasContent(0, 3)).toBe(true);
    expect(weekHasContent(1, 0)).toBe(true);
  });

  it("stays out of the way for a quiet or dismissed week", () => {
    expect(lastWeekRowState({ ...base, hasContent: false })).toBe("hidden");
    expect(weekHasContent(0, 2)).toBe(false);
    expect(lastWeekRowState({ ...base, dismissedWeek: week.key })).toBe("hidden");
  });

  it("asks for access once, never after a no", () => {
    expect(lastWeekRowState({ ...base, access: "undetermined" })).toBe("ask");
    expect(lastWeekRowState({ ...base, access: "undetermined", askDismissed: true })).toBe("hidden");
    expect(lastWeekRowState({ ...base, access: "denied" })).toBe("hidden");
  });
});

describe("weekPhotosView", () => {
  const song = {
    key: "s1",
    storeId: "s1",
    title: "T",
    artistName: "A",
    albumTitle: "",
    reason: "played" as const,
    day: "2026-11-12",
    at: at(2026, 11, 12),
    plays: 3,
    playsAreWeekly: true,
  };
  const photo = (id: string, d: number) => ({ id, uri: `ph://${id}`, createdAt: at(2026, 11, d) });

  it("regroups the days when photos drop out, keeping the songs", () => {
    const before = weekPhotosView([song], [photo("p1", 12), photo("p2", 13)]);
    expect(before.days.map((d) => d.key)).toEqual(["2026-11-13", "2026-11-12"]);
    expect(photosOfDays(before.days).map((p) => p.id).sort()).toEqual(["p1", "p2"]);

    const after = weekPhotosView([song], [photo("p1", 12)]);
    expect(after.days.map((d) => d.key)).toEqual(["2026-11-12"]);
    expect(after.photoCount).toBe(1);
    expect(after.hasContent).toBe(true);
  });

  it("is a quiet week once too few photos remain and there are no songs", () => {
    expect(weekPhotosView([], [photo("p1", 12), photo("p2", 12), photo("p3", 12)]).hasContent).toBe(true);
    expect(weekPhotosView([], [photo("p1", 12), photo("p2", 12)]).hasContent).toBe(false);
  });
});
