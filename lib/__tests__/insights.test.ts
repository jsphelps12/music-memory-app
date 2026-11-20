import { describe, expect, it } from "vitest";
import {
  artistHighlights,
  comingBack,
  comingBackWhen,
  insightsSummary,
  journalInsights,
  repeatArtists,
  type InsightMoment,
} from "@/lib/insights";

const m = (over: Partial<InsightMoment>): InsightMoment => ({
  momentDate: "2026-11-01",
  songTitle: "Song",
  songArtist: "Artist",
  songArtworkUrl: "",
  moods: [],
  people: [],
  ...over,
});

describe("journalInsights", () => {
  it("is empty for no moments", () => {
    expect(journalInsights([])).toEqual({
      moments: 0,
      songs: 0,
      artists: 0,
      topArtists: [],
      featuring: [],
      moods: [],
    });
  });

  it("counts distinct songs and artists, case and spaces aside", () => {
    const i = journalInsights([
      m({ songTitle: "Dreams", songArtist: "Fleetwood Mac" }),
      m({ songTitle: "dreams ", songArtist: "fleetwood mac" }),
      m({ songTitle: "Dreams", songArtist: "The Cranberries" }),
    ]);
    expect(i.moments).toBe(3);
    expect(i.songs).toBe(2); // the same title by two artists is two songs
    expect(i.artists).toBe(2);
  });

  it("ranks artists by moments, keeping the most recent artwork and first-seen name", () => {
    const i = journalInsights([
      m({ songArtist: "Bon Iver", songArtworkUrl: "" }),
      m({ songArtist: "Fleetwood Mac", songArtworkUrl: "fm-new" }),
      m({ songArtist: "bon iver", songArtworkUrl: "bi-old" }),
      m({ songArtist: "Fleetwood Mac", songArtworkUrl: "fm-old" }),
      m({ songArtist: "Frank Ocean", songArtworkUrl: "fo" }),
    ]);
    expect(i.topArtists.map((a) => [a.name, a.count, a.artworkUrl])).toEqual([
      ["Bon Iver", 2, "bi-old"],
      ["Fleetwood Mac", 2, "fm-new"],
      ["Frank Ocean", 1, "fo"],
    ]);
  });

  it("counts a person or mood once per moment", () => {
    const i = journalInsights([
      m({ people: ["Maya", "maya ", "Sam"], moods: ["joyful", "joyful"] }),
      m({ people: ["Maya"], moods: ["peaceful", "joyful"] }),
    ]);
    expect(i.featuring).toEqual([
      { value: "Maya", count: 2 },
      { value: "Sam", count: 1 },
    ]);
    expect(i.moods).toEqual([
      { value: "joyful", count: 2 },
      { value: "peaceful", count: 1 },
    ]);
  });

  it("ignores blank songs, artists and people", () => {
    const i = journalInsights([m({ songTitle: "", songArtist: " ", people: ["", "  "] })]);
    expect(i).toMatchObject({ moments: 1, songs: 0, artists: 0, topArtists: [], featuring: [] });
  });
});

describe("insightsSummary", () => {
  it("pluralizes each count", () => {
    expect(insightsSummary({ moments: 1, songs: 2, artists: 1 })).toBe("1 moment · 2 songs · 1 artist");
    expect(insightsSummary({ moments: 1200, songs: 900, artists: 300 })).toBe(
      "1,200 moments · 900 songs · 300 artists"
    );
  });
});

describe("repeatArtists", () => {
  it("keeps only artists with two or more moments, capped", () => {
    const i = journalInsights([
      m({ songArtist: "A" }),
      m({ songArtist: "B" }),
      m({ songArtist: "A" }),
      m({ songArtist: "C" }),
      m({ songArtist: "C" }),
      m({ songArtist: "C" }),
    ]);
    expect(repeatArtists(i, 5).map((a) => [a.name, a.count])).toEqual([
      ["C", 3],
      ["A", 2],
    ]);
    expect(repeatArtists(i, 1).map((a) => a.name)).toEqual(["C"]);
    expect(repeatArtists(journalInsights([m({ songArtist: "Solo" })]), 5)).toEqual([]);
  });
});

describe("artistHighlights", () => {
  it("ranks repeats when there are any", () => {
    const i = journalInsights([m({ songArtist: "A" }), m({ songArtist: "B" }), m({ songArtist: "A" })]);
    const h = artistHighlights(i, 5);
    expect(h.kind).toBe("repeats");
    expect(h.artists.map((a) => a.name)).toEqual(["A"]);
  });

  it("falls back to the most recent artists, with their latest song, when nobody repeats", () => {
    const i = journalInsights([
      m({ songArtist: "Newest", songTitle: "Latest" }),
      m({ songArtist: "Middle", songTitle: "Mid" }),
      m({ songArtist: "Oldest", songTitle: "First" }),
    ]);
    const h = artistHighlights(i, 2);
    expect(h.kind).toBe("recent");
    expect(h.artists.map((a) => [a.name, a.latestSong])).toEqual([
      ["Newest", "Latest"],
      ["Middle", "Mid"],
    ]);
  });
});

describe("comingBack", () => {
  const s = (title: string, artist: string, momentDate: string | null, songArtworkUrl = "") =>
    m({ songTitle: title, songArtist: artist, momentDate, songArtworkUrl });

  it("is empty with no moments, or when no song repeats", () => {
    expect(comingBack([], 5)).toEqual([]);
    expect(comingBack([s("A", "X", "2026-01-01"), s("B", "X", "2026-01-02")], 5)).toEqual([]);
  });

  it("keeps songs with two or more moments, with their dates oldest first", () => {
    const out = comingBack(
      [
        s("Dreams", "Fleetwood Mac", "2026-11-01", "new"),
        s("Solo", "Frank Ocean", "2026-10-01"),
        s("Dreams", "Fleetwood Mac", "2023-07-04", "old"),
        s("Dreams", "Fleetwood Mac", "2019-03-02", "older"),
      ],
      5
    );
    expect(out).toEqual([
      {
        title: "Dreams",
        artist: "Fleetwood Mac",
        artworkUrl: "new",
        count: 3,
        dates: ["2019-03-02", "2023-07-04", "2026-11-01"],
      },
    ]);
  });

  it("groups case and spaces aside, naming the song as its most recent moment stores it", () => {
    const out = comingBack(
      [s("dreams ", "fleetwood mac", "2026-01-01"), s("Dreams", " Fleetwood Mac", "2026-05-01")],
      5
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "Dreams", artist: " Fleetwood Mac", count: 2 });
  });

  it("treats the same title by different artists as different songs", () => {
    const out = comingBack(
      [
        s("Dreams", "Fleetwood Mac", "2026-01-01"),
        s("Dreams", "The Cranberries", "2026-01-02"),
        s("Dreams", "The Cranberries", "2025-01-02"),
      ],
      5
    );
    expect(out.map((x) => [x.artist, x.count])).toEqual([["The Cranberries", 2]]);
  });

  it("orders by moments, then most recently written to, then first seen", () => {
    const out = comingBack(
      [
        s("Old pair", "A", "2020-01-01"),
        s("Recent pair", "B", "2026-06-01"),
        s("Trio", "C", "2018-01-01"),
        s("Old pair", "A", "2019-01-01"),
        s("Recent pair", "B", "2015-01-01"),
        s("Trio", "C", "2017-01-01"),
        s("Trio", "C", "2016-01-01"),
        s("Same day 1", "D", "2021-01-01"),
        s("Same day 2", "E", "2021-01-01"),
        s("Same day 1", "D", null),
        s("Same day 2", "E", null),
      ],
      10
    );
    expect(out.map((x) => x.title)).toEqual(["Trio", "Recent pair", "Same day 1", "Same day 2", "Old pair"]);
  });

  it("counts undated moments but leaves them out of dates and below dated ones for recency", () => {
    const out = comingBack(
      [s("Undated", "A", null), s("Dated", "B", "2001-01-01"), s("Undated", "A", null), s("Dated", "B", "2000-01-01")],
      5
    );
    expect(out.map((x) => [x.title, x.count, x.dates])).toEqual([
      ["Dated", 2, ["2000-01-01", "2001-01-01"]],
      ["Undated", 2, []],
    ]);
  });

  it("takes artwork from the most recent moment that has any", () => {
    const out = comingBack(
      [
        s("S", "A", null, "undated"),
        s("S", "A", "2026-01-01", ""),
        s("S", "A", "2025-01-01", "dated"),
        s("S", "A", "2024-01-01", "older"),
      ],
      5
    );
    expect(out[0].artworkUrl).toBe("dated");
    expect(comingBack([s("S", "A", "2026-01-01"), s("S", "A", null)], 5)[0].artworkUrl).toBeNull();
  });

  it("skips moments with no title or no artist, and caps at max", () => {
    expect(comingBack([s("", "A", null), s(" ", "A", null), s("T", "", null), s("T", "  ", null)], 5)).toEqual([]);
    const many = ["A", "B", "C"].flatMap((t) => [s(t, "X", "2026-01-01"), s(t, "X", "2025-01-01")]);
    expect(comingBack(many, 2).map((x) => x.title)).toEqual(["A", "B"]);
  });
});

describe("comingBackWhen", () => {
  const now = new Date(2026, 10, 20);

  it('lists the years when the dates span years, this one as "this year"', () => {
    expect(comingBackWhen(["2019-03-02", "2023-07-04", "2026-11-01"], 3, now)).toBe("2019 · 2023 · this year");
    expect(comingBackWhen(["2023-07-04", "2019-03-02", "2019-05-02"], 3, now)).toBe("2019 · 2023");
  });

  it("shows the span past four years", () => {
    expect(comingBackWhen(["2012-01-01", "2014-01-01", "2016-01-01", "2020-01-01", "2026-01-01"], 5, now)).toBe(
      "2012 to this year"
    );
    expect(comingBackWhen(["2012-01-01", "2014-01-01", "2016-01-01", "2018-01-01", "2020-01-01"], 5, now)).toBe(
      "2012 to 2020"
    );
  });

  it("lists the months within one year, adding the year unless it's this one", () => {
    expect(comingBackWhen(["2026-11-03", "2026-03-01", "2026-07-09", "2026-07-20"], 4, now)).toBe(
      "March · July · November"
    );
    expect(comingBackWhen(["2021-03-01", "2021-07-09"], 2, now)).toBe("March · July 2021");
    expect(comingBackWhen(["2026-02-01", "2026-03-01", "2026-05-01", "2026-08-01", "2026-11-01"], 5, now)).toBe(
      "February to November"
    );
  });

  it("falls back to a count within one month or without dates", () => {
    expect(comingBackWhen(["2026-11-01", "2026-11-15"], 2, now)).toBe("2 times");
    expect(comingBackWhen(["2026-11-01"], 3, now)).toBe("3 times"); // the others undated
    expect(comingBackWhen([], 2, now)).toBe("2 times");
    expect(comingBackWhen([], 1, now)).toBe("1 time");
    expect(comingBackWhen(["not a date", "2026-13-01"], 2, now)).toBe("2 times");
  });
});
