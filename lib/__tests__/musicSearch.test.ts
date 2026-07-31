import { describe, expect, it } from "vitest";

import { normalizeForMatch, rankSongResults } from "../musicSearch";

const song = (title: string) => ({ title });
const titles = (songs: Array<{ title: string }>) => songs.map((s) => s.title);

describe("normalizeForMatch", () => {
  it("lowercases and trims", () => {
    expect(normalizeForMatch("  Otro Atardecer ")).toBe("otro atardecer");
  });

  it("strips diacritics", () => {
    expect(normalizeForMatch("Atardecér")).toBe("atardecer");
    expect(normalizeForMatch("Señorita")).toBe("senorita");
  });
});

describe("rankSongResults", () => {
  it("moves an exact title match above more popular results", () => {
    const results = [
      song("Atardecer de Fuego"),
      song("Sunset Song"),
      song("Otro Atardecer"),
    ];
    expect(titles(rankSongResults("otro atardecer", results))).toEqual([
      "Otro Atardecer",
      "Atardecer de Fuego",
      "Sunset Song",
    ]);
  });

  it("matches exact titles accent- and case-insensitively", () => {
    const results = [song("Popular Hit"), song("OTRO ATARDECÉR")];
    expect(titles(rankSongResults("otro atardecer", results))[0]).toBe(
      "OTRO ATARDECÉR"
    );
  });

  it("ranks prefix matches above contains and non-matches", () => {
    const results = [
      song("La Vida (Otro Atardecer Remix)"),
      song("Otro Atardecer en la Playa"),
      song("Otro Atardecer"),
    ];
    expect(titles(rankSongResults("otro atardecer", results))).toEqual([
      "Otro Atardecer",
      "Otro Atardecer en la Playa",
      "La Vida (Otro Atardecer Remix)",
    ]);
  });

  it("preserves provider order within a tier", () => {
    const results = [song("Alpha"), song("Beta"), song("Gamma")];
    expect(titles(rankSongResults("delta", results))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("preserves provider order between multiple exact matches", () => {
    const results = [
      song("Filler"),
      song("Yesterday"),
      song("Yesterday"),
    ];
    const ranked = rankSongResults("yesterday", results);
    expect(ranked[0]).toBe(results[1]);
    expect(ranked[1]).toBe(results[2]);
  });

  it("returns results unchanged for an empty query", () => {
    const results = [song("B"), song("A")];
    expect(titles(rankSongResults("  ", results))).toEqual(["B", "A"]);
  });
});
