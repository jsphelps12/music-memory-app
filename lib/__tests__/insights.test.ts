import { describe, expect, it } from "vitest";
import { insightsSummary, journalInsights, repeatArtists, type InsightMoment } from "@/lib/insights";

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
