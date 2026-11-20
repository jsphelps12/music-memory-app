import { describe, expect, it } from "vitest";
import { profileStats } from "@/lib/profileStats";

const m = (songTitle: string, songArtist: string, momentDate: string | null) => ({
  songTitle,
  songArtist,
  momentDate,
});

describe("profileStats", () => {
  it("is all zeros for no moments", () => {
    expect(profileStats([])).toEqual({ moments: 0, songs: 0, artists: 0, days: 0, topArtist: null });
  });

  it("counts distinct songs, artists and days", () => {
    const stats = profileStats([
      m("Dreams", "Fleetwood Mac", "2026-11-09"),
      m("Dreams", "Fleetwood Mac", "2026-11-09T21:00:00Z"),
      m("Dreams", "The Cranberries", "2026-11-10"),
      m("Landslide", "fleetwood mac ", "2026-11-12"),
    ]);
    expect(stats.moments).toBe(4);
    expect(stats.songs).toBe(3); // the same title by two artists is two songs
    expect(stats.artists).toBe(2); // case and spaces don't split an artist
    expect(stats.days).toBe(3);
    expect(stats.topArtist).toEqual({ name: "Fleetwood Mac", count: 3 });
  });

  it("ignores missing dates and blank songs", () => {
    const stats = profileStats([m("", "", null), m("Heroes", "David Bowie", null)]);
    expect(stats).toMatchObject({ moments: 2, songs: 1, artists: 1, days: 0 });
  });

  it("keeps the first artist to reach the top count on a tie", () => {
    const stats = profileStats([m("A", "First", "2026-01-01"), m("B", "Second", "2026-01-02")]);
    expect(stats.topArtist?.name).toBe("First");
  });
});
