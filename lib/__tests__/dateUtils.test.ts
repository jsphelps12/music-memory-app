import { describe, it, expect } from "vitest";
import { dateToStr, pad } from "../dateUtils";

describe("pad", () => {
  it("pads single digit numbers with a leading zero", () => {
    expect(pad(1)).toBe("01");
    expect(pad(9)).toBe("09");
  });

  it("does not pad two-digit numbers", () => {
    expect(pad(10)).toBe("10");
    expect(pad(12)).toBe("12");
  });
});

describe("dateToStr", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(dateToStr(new Date(2024, 5, 15))).toBe("2024-06-15"); // June 15
  });

  it("zero-pads single-digit month and day", () => {
    expect(dateToStr(new Date(2024, 0, 7))).toBe("2024-01-07"); // Jan 7
  });

  it("handles the first day of the year", () => {
    expect(dateToStr(new Date(2025, 0, 1))).toBe("2025-01-01");
  });

  it("handles the last day of the year", () => {
    expect(dateToStr(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("handles a two-digit day correctly", () => {
    expect(dateToStr(new Date(2023, 9, 26))).toBe("2023-10-26"); // Oct 26
  });
});
