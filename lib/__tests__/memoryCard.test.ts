import { describe, expect, it } from "vitest";
import { anniversaryLabel, fullDateLabel } from "../memoryCard";

const today = new Date(2026, 10, 14); // November 14, 2026

describe("anniversaryLabel", () => {
  it("names the anniversary on the day", () => {
    expect(anniversaryLabel("2021-11-14", today)).toBe("5 years ago today");
    expect(anniversaryLabel("2025-11-14", today)).toBe("1 year ago today");
  });
  it("drops 'today' on other days", () => {
    expect(anniversaryLabel("2021-11-13", today)).toBe("5 years ago");
  });
  it("handles this year and missing dates", () => {
    expect(anniversaryLabel("2026-11-14", today)).toBe("Today");
    expect(anniversaryLabel("2026-03-01", today)).toBe("Earlier this year");
    expect(anniversaryLabel(null, today)).toBeNull();
    expect(anniversaryLabel("nope", today)).toBeNull();
  });
});

describe("fullDateLabel", () => {
  it("formats the date in full", () => {
    expect(fullDateLabel("2021-11-14")).toBe("November 14, 2021");
  });
});
