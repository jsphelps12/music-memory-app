import { describe, expect, it, vi } from "vitest";
import {
  buildCalendarMonths,
  groupMomentsByMonth,
  monthKeyOf,
  monthLabel,
  NO_DATE_TITLE,
} from "../monthGroups";

const mo = (id: string, momentDate: string | null) => ({ id, momentDate });

describe("monthKeyOf", () => {
  it("takes the year and month from the date string", () => {
    expect(monthKeyOf("2026-02-14")).toBe("2026-02");
  });
  it("is null for a missing or malformed date", () => {
    expect(monthKeyOf(null)).toBeNull();
    expect(monthKeyOf("")).toBeNull();
    expect(monthKeyOf("Feb 2026")).toBeNull();
  });
});

describe("monthLabel", () => {
  it("formats the month the way the list always titled it", () => {
    expect(monthLabel("2026-02")).toBe("February 2026");
    expect(monthLabel("1999-12")).toBe("December 1999");
  });

  it("formats each month once", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleDateString");
    monthLabel("2031-07");
    monthLabel("2031-07");
    monthLabel("2031-07");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("groupMomentsByMonth", () => {
  it("groups in list order, one section per month, undated under No Date", () => {
    const list = [
      mo("a", "2026-03-02"),
      mo("b", "2026-03-01"),
      mo("c", "2026-01-31"),
      mo("d", "2025-12-25"),
      mo("e", null),
    ];
    const sections = groupMomentsByMonth(list);
    expect(sections.map((s) => s.title)).toEqual([
      "March 2026",
      "January 2026",
      "December 2025",
      NO_DATE_TITLE,
    ]);
    expect(sections[0].data.map((m) => m.id)).toEqual(["a", "b"]);
    expect(sections[3].data.map((m) => m.id)).toEqual(["e"]);
  });

  it("matches the old per-moment toLocaleDateString titles", () => {
    const dates = ["2024-01-01", "2024-06-30", "2023-11-15", "2020-02-29"];
    const sections = groupMomentsByMonth(dates.map((d, i) => mo(String(i), d)));
    expect(sections.map((s) => s.title)).toEqual(
      dates.map((d) =>
        new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      )
    );
  });

  it("is empty for no moments", () => {
    expect(groupMomentsByMonth([])).toEqual([]);
  });
});

describe("buildCalendarMonths", () => {
  it("only months with moments, newest first, moments by day", () => {
    const { months, undated } = buildCalendarMonths([
      mo("a", "2025-12-25"),
      mo("b", "2026-03-02"),
      mo("c", "2026-03-02"),
      mo("d", "2026-03-15"),
      mo("e", null),
    ]);
    expect(months.map((m) => m.key)).toEqual(["2026-03", "2025-12"]);
    expect(months[0]).toMatchObject({ year: 2026, month: 2, label: "March 2026" });
    expect(months[0].days.get(2)?.map((m) => m.id)).toEqual(["b", "c"]);
    expect(months[0].days.get(15)?.map((m) => m.id)).toEqual(["d"]);
    expect(months[1].days.get(25)?.map((m) => m.id)).toEqual(["a"]);
    expect(undated.map((m) => m.id)).toEqual(["e"]);
  });

  it("skips a malformed date rather than drawing a broken month", () => {
    const { months, undated } = buildCalendarMonths([mo("a", "2026-03-xx"), mo("b", "nope")]);
    expect(months).toEqual([]);
    expect(undated).toEqual([]);
  });
});
