import { describe, expect, it } from "vitest";
import {
  artistTileDetail,
  personSoundtrack,
  togetherLine,
  type PersonSoundtrackMoment,
} from "@/lib/personSoundtrack";

const m = (over: Partial<PersonSoundtrackMoment>): PersonSoundtrackMoment => ({
  momentDate: "2026-11-01",
  songTitle: "Song",
  songArtist: "Artist",
  songArtworkUrl: "",
  moods: [],
  ...over,
});

const MOODS = [
  { value: "joyful", label: "Joyful" },
  { value: "nostalgic", label: "Nostalgic" },
  { value: "peaceful", label: "Peaceful" },
  { value: "sad", label: "Sad" },
  { value: "custom_1", label: "Road trip" },
];

describe("togetherLine", () => {
  it("counts one moment in the singular", () => {
    expect(togetherLine([m({})])).toBe("1 moment together");
  });

  it("adds since the first month when the moments span months", () => {
    expect(
      togetherLine([m({ momentDate: "2026-11-01" }), m({ momentDate: "2025-01-10" }), m({ momentDate: "2024-03-22" })])
    ).toBe("3 moments together · since March 2024");
  });

  it("leaves since out when first and latest are the same month", () => {
    expect(togetherLine([m({ momentDate: "2026-11-30" }), m({ momentDate: "2026-11-01" })])).toBe(
      "2 moments together"
    );
  });

  it("finds the first month whatever the order, ignoring undated moments", () => {
    expect(
      togetherLine([m({ momentDate: null }), m({ momentDate: "2024-03-01" }), m({ momentDate: "2025-06-01" })])
    ).toBe("3 moments together · since March 2024");
    expect(togetherLine([m({ momentDate: null }), m({ momentDate: "2024-03-01" })])).toBe("2 moments together");
  });
});

describe("artistTileDetail", () => {
  it("shows a count once it repeats, the song before that", () => {
    expect(artistTileDetail({ count: 4, latestSong: "Dreams" })).toBe("4 moments");
    expect(artistTileDetail({ count: 1, latestSong: "Dreams" })).toBe("Dreams");
    expect(artistTileDetail({ count: 1, latestSong: "" })).toBe("1 moment");
  });
});

describe("personSoundtrack", () => {
  it("is null with no moments", () => {
    expect(personSoundtrack([], MOODS)).toBeNull();
  });

  it("shows only the count line for a single moment", () => {
    expect(personSoundtrack([m({ songArtist: "Mitski", moods: ["joyful"] })], MOODS)).toEqual({
      summary: "1 moment together",
      artists: null,
      moods: null,
    });
  });

  it("ranks the artists that repeat, case and spaces aside, at most three", () => {
    const s = personSoundtrack(
      [
        m({ songArtist: "Phoebe Bridgers", songTitle: "Motion Sickness", songArtworkUrl: "pb.jpg" }),
        m({ songArtist: "Mitski" }),
        m({ songArtist: "phoebe bridgers " }),
        m({ songArtist: "Mitski" }),
        m({ songArtist: "Mitski" }),
        m({ songArtist: "Big Thief" }),
        m({ songArtist: "Big Thief" }),
        m({ songArtist: "Lorde" }),
        m({ songArtist: "Lorde" }),
      ],
      MOODS
    )!;
    expect(s.artists?.kind).toBe("repeats");
    expect(s.artists?.artists.map((a) => [a.name, a.count])).toEqual([
      ["Mitski", 3],
      ["Phoebe Bridgers", 2],
      ["Big Thief", 2],
    ]);
    expect(s.artists?.artists[1]).toMatchObject({ artworkUrl: "pb.jpg", latestSong: "Motion Sickness" });
  });

  it("leaves out artists that appear once when some repeat", () => {
    const s = personSoundtrack(
      [m({ songArtist: "Lorde" }), m({ songArtist: "Mitski" }), m({ songArtist: "Mitski" })],
      MOODS
    )!;
    expect(s.artists?.artists.map((a) => a.name)).toEqual(["Mitski"]);
  });

  it("falls back to the three most recent artists with their song when nothing repeats", () => {
    const s = personSoundtrack(
      [
        m({ songArtist: "A", songTitle: "One" }),
        m({ songArtist: "B", songTitle: "Two" }),
        m({ songArtist: "C", songTitle: "Three" }),
        m({ songArtist: "D", songTitle: "Four" }),
      ],
      MOODS
    )!;
    expect(s.artists?.kind).toBe("recent");
    expect(s.artists?.artists.map((a) => [a.name, a.latestSong])).toEqual([
      ["A", "One"],
      ["B", "Two"],
      ["C", "Three"],
    ]);
  });

  it("has no artists when no moment names one", () => {
    const s = personSoundtrack([m({ songArtist: "" }), m({ songArtist: "  " })], MOODS)!;
    expect(s.artists).toBeNull();
  });

  it("lists the moods used most as words, ties most recent first, at most three", () => {
    const s = personSoundtrack(
      [
        m({ moods: ["peaceful", "joyful"] }),
        m({ moods: ["sad"] }),
        m({ moods: ["joyful", "joyful"] }),
        m({ moods: ["nostalgic", "joyful"] }),
        m({ moods: ["nostalgic"] }),
      ],
      MOODS
    )!;
    expect(s.moods).toBe("Joyful · nostalgic · peaceful");
  });

  it("skips deleted custom moods and keeps a custom mood's own case", () => {
    const s = personSoundtrack(
      [m({ moods: ["custom_gone", "custom_1"] }), m({ moods: ["custom_gone", "sad"] })],
      MOODS
    )!;
    expect(s.moods).toBe("Road trip · sad");
  });

  it("has no mood line when no mood has a label", () => {
    expect(personSoundtrack([m({}), m({ moods: ["custom_gone"] })], MOODS)!.moods).toBeNull();
  });
});
