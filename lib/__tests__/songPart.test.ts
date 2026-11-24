import { describe, expect, it } from "vitest";
import { formatSongTime, normalizePartMs, partFraction, partLabel, partStartSeconds } from "@/lib/songPart";

describe("formatSongTime", () => {
  it("reads like a player's clock", () => {
    expect(formatSongTime(0)).toBe("0:00");
    expect(formatSongTime(7_400)).toBe("0:07");
    expect(formatSongTime(161_000)).toBe("2:41");
    expect(formatSongTime(3_723_000)).toBe("1:02:03");
    expect(formatSongTime(-5)).toBe("0:00");
  });
});

describe("normalizePartMs", () => {
  it("rounds to the second people picked", () => {
    expect(normalizePartMs(161_400)).toBe(161_000);
    expect(normalizePartMs(161_600)).toBe(162_000);
  });

  it("drops a part at the very start, or none at all", () => {
    expect(normalizePartMs(400)).toBeNull();
    expect(normalizePartMs(null)).toBeNull();
    expect(normalizePartMs(Number.NaN)).toBeNull();
  });

  it("keeps it inside the song when the length is known", () => {
    expect(normalizePartMs(300_000, 240_000)).toBe(239_000);
    expect(normalizePartMs(120_000, 240_000)).toBe(120_000);
  });

  it("stays under the column's limit", () => {
    expect(normalizePartMs(9_999_999)).toBe(7_199_000);
  });
});

describe("partStartSeconds and partLabel", () => {
  it("start where the part is, or at the top", () => {
    expect(partStartSeconds(161_000)).toBe(161);
    expect(partStartSeconds(null)).toBeUndefined();
    expect(partStartSeconds(500)).toBeUndefined();
    expect(partLabel(161_000)).toBe("at 2:41");
    expect(partLabel(undefined)).toBeNull();
  });
});

describe("partFraction", () => {
  it("places the mark along the song", () => {
    expect(partFraction(60_000, 240_000)).toBe(0.25);
    expect(partFraction(60_000, 0)).toBeNull();
    expect(partFraction(null, 240_000)).toBeNull();
    expect(partFraction(300_000, 240_000)).toBe(1);
  });
});
