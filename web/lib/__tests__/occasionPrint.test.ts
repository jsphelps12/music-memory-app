import { describe, expect, it } from "vitest";
import { bookPages, cardsByGuest, fitWords, tracklistLayout, wordsSize, type PrintMoment } from "../occasionPrint";

const m = (i: number, over: Partial<PrintMoment> = {}): PrintMoment => ({
  id: `e${i}`,
  guestName: `Guest ${i}`,
  title: `Song ${i}`,
  artist: "Artist",
  words: null,
  photoUrl: null,
  artworkUrl: null,
  when: "9:00 PM",
  ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => m(i + 1));

describe("tracklistLayout", () => {
  it("uses two sides for a small wedding, more as it grows", () => {
    expect(tracklistLayout(many(16)).sides.map((s) => [s.label, s.tracks.length])).toEqual([["A", 8], ["B", 8]]);
    expect(tracklistLayout(many(87)).sides).toHaveLength(3);
    expect(tracklistLayout(many(300)).sides.map((s) => s.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps numbering continuous across sides", () => {
    const { sides } = tracklistLayout(many(87));
    expect(sides.map((s) => s.start)).toEqual([0, 29, 58]);
    expect(sides.reduce((n, s) => n + s.tracks.length, 0)).toBe(87);
  });

  it("shrinks rows to fit, but not past a cap for short lists", () => {
    expect(tracklistLayout(many(4)).rowCqw).toBe(4.2);
    expect(tracklistLayout(many(300)).rowCqw).toBeLessThan(1.4);
  });

  it("handles one song and none", () => {
    expect(tracklistLayout(many(1)).sides).toHaveLength(1);
    expect(tracklistLayout([]).sides).toEqual([]);
  });
});

describe("cardsByGuest", () => {
  it("gives each guest one card, with their first song", () => {
    const cards = cardsByGuest([m(1, { guestName: "Mara" }), m(2, { guestName: "Dev" }), m(3, { guestName: "mara " })]);
    expect(cards.map((c) => c.id)).toEqual(["e1", "e2"]);
  });
});

describe("bookPages", () => {
  it("gives photo and word moments their own page, song-only picks tracklist pages at the back", () => {
    const pages = bookPages([
      m(1, { photoUrl: "https://p" }),
      m(2),
      m(3, { words: "Every Sunday." }),
      ...many(15).map((x, i) => ({ ...x, id: `s${i}` })),
    ]);
    expect(pages.map((p) => p.kind)).toEqual(["moment", "moment", "tracklist", "tracklist"]);
    const first = pages[2];
    expect(first.kind === "tracklist" && first.tracks.map((t) => t.number).slice(0, 2)).toEqual([2, 4]);
    expect(pages[3].kind === "tracklist" && pages[3].tracks).toHaveLength(2);
  });
});

describe("words on a page", () => {
  it("steps type down as words get longer", () => {
    expect(wordsSize("short", false)).toBe("large");
    expect(wordsSize("x".repeat(300), false)).toBe("medium");
    expect(wordsSize("x".repeat(900), false)).toBe("small");
    expect(wordsSize("x".repeat(200), true)).toBe("small");
  });

  it("ends overlong words with an ellipsis", () => {
    expect(fitWords("x".repeat(2000), true)).toHaveLength(420);
    expect(fitWords("x".repeat(2000), true).endsWith("…")).toBe(true);
    expect(fitWords("fine", false)).toBe("fine");
  });
});
