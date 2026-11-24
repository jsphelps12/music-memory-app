import { describe, expect, it } from "vitest";
import { insightsComingUp, isSmallJournal, rediscoverComingUp } from "../comingUp";

const NOW = new Date(2026, 10, 24); // November 24, 2026

let n = 0;
function m(date: string | null, over: Record<string, unknown> = {}) {
  n += 1;
  return {
    id: `m${n}`,
    momentDate: date,
    songTitle: `Song ${n}`,
    songArtworkUrl: `https://art/${n}.jpg`,
    songGenre: null as string | null,
    songReleaseDate: null as string | null,
    timeOfDay: null as string | null,
    ...over,
  };
}

describe("isSmallJournal", () => {
  it("is small while no moment is a year old", () => {
    expect(isSmallJournal([m("2026-01-03"), m("2026-11-20")], NOW)).toBe(true);
  });
  it("isn't once a moment is a year old (On this day can show it)", () => {
    expect(isSmallJournal([m("2025-11-24"), m("2026-11-20")], NOW)).toBe(false);
  });
  it("isn't for an empty journal (that has its own empty state)", () => {
    expect(isSmallJournal([], NOW)).toBe(false);
    expect(isSmallJournal([m(null)], NOW)).toBe(false);
  });
});

describe("rediscoverComingUp", () => {
  it("brings the first moment back on its first anniversary", () => {
    const first = m("2026-03-12", { songTitle: "  Dreams " });
    const rows = rediscoverComingUp([m("2026-10-01"), first], NOW);
    expect(rows[0]).toEqual({
      key: "on_this_day",
      label: "Dreams",
      subtitle: "Comes back on this day, March 12, 2027",
      momentId: first.id,
      artworkUrl: first.songArtworkUrl,
    });
  });

  it("promises the weekly rewind while everything is from this month", () => {
    const rows = rediscoverComingUp([m("2026-11-02"), m("2026-11-20")], NOW);
    expect(rows.find((r) => r.key === "rewind")?.subtitle).toBe(
      "A month you wrote in, back each week from December 1"
    );
    // An earlier month already gives the rewind something.
    expect(rediscoverComingUp([m("2026-10-02"), m("2026-11-20")], NOW).some((r) => r.key === "rewind")).toBe(false);
  });

  it("says how many more moments the year in review needs, and when it opens", () => {
    const rows = rediscoverComingUp([m("2026-11-02"), m("2026-11-20")], NOW);
    expect(rows.find((r) => r.key === "year_review")).toEqual({
      key: "year_review",
      label: "Your 2026 in review",
      subtitle: "Opens December 1, with 3 more moments this year",
      detail: "3 more",
    });
  });

  it("just says when it opens once there are enough", () => {
    const five = ["03", "05", "07", "09", "11"].map((mm) => m(`2026-${mm}-01`));
    expect(rediscoverComingUp(five, NOW).find((r) => r.key === "year_review")).toEqual({
      key: "year_review",
      label: "Your 2026 in review",
      subtitle: "Opens December 1",
    });
  });

  it("in December the review is already there when it has enough; short of it, only the count", () => {
    const dec = new Date(2026, 11, 5);
    const five = ["03", "05", "07", "09", "12"].map((mm) => m(`2026-${mm}-01`));
    expect(rediscoverComingUp(five, dec).some((r) => r.key === "year_review")).toBe(false);
    expect(rediscoverComingUp([m("2026-12-01")], dec).find((r) => r.key === "year_review")?.subtitle).toBe(
      "Opens with 4 more moments this year"
    );
  });

  it("is empty for a journal that isn't small", () => {
    expect(rediscoverComingUp([m("2024-05-01"), m("2026-11-20")], NOW)).toEqual([]);
  });

  it("says 1 more moment, not moments", () => {
    const four = ["03", "05", "07", "09"].map((mm) => m(`2026-${mm}-01`));
    expect(rediscoverComingUp(four, NOW).find((r) => r.key === "year_review")?.subtitle).toBe(
      "Opens December 1, with 1 more moment this year"
    );
  });
});

describe("insightsComingUp", () => {
  it("under the minimum, lists every section with what it needs", () => {
    const rows = insightsComingUp([m("2026-11-20", { songGenre: "Pop", timeOfDay: "Evening" })]);
    expect(rows.map((r) => [r.key, r.detail])).toEqual([
      ["artists", "2 more"],
      ["coming_back", undefined],
      ["resonates", "2 more"],
      ["when", "4 more"],
    ]);
  });

  it("past the minimum, lists only the sections still short", () => {
    const three = [1, 2, 3].map(() => m("2026-11-20", { songGenre: "Pop", songReleaseDate: "1999-01-01", timeOfDay: "Evening" }));
    const rows = insightsComingUp(three);
    expect(rows.map((r) => r.key)).toEqual(["when"]);
    expect(rows[0].detail).toBe("2 more");
  });

  it("never promises a section that has enough moments but no clear pattern", () => {
    const times = ["Morning", "Afternoon", "Evening", "Night", "Late Night", "Morning", "Evening"];
    const genres = ["Pop", "Rock", "Jazz", "Folk"];
    const meta = times.map((t, i) =>
      m(`2026-11-${String(10 + i).padStart(2, "0")}`, { timeOfDay: t, songGenre: genres[i % 4] })
    );
    const rows = insightsComingUp(meta);
    expect(rows.some((r) => r.key === "when")).toBe(false);
    expect(rows.some((r) => r.key === "resonates")).toBe(false);
  });

  it("carries no titles, artists or words, only section names and counts", () => {
    const rows = insightsComingUp([m("2026-11-20", { songTitle: "Secret Song" })]);
    expect(JSON.stringify(rows)).not.toContain("Secret Song");
  });
});
