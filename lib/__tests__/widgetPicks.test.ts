import { describe, expect, it } from "vitest";
import {
  addDays,
  firstLine,
  hash,
  longDate,
  MIN_AGE_DAYS,
  momentDay,
  pickWidgetMoments,
  rollShown,
  yearsAgoToday,
  type WidgetSourceMoment,
} from "../widgetPicks";

const TODAY = "2026-11-23";

function m(id: string, momentDate: string | null, over: Partial<WidgetSourceMoment> = {}): WidgetSourceMoment {
  return {
    id,
    momentDate,
    songTitle: `Song ${id}`,
    songArtist: `Artist ${id}`,
    artworkUrl: `https://is1-ssl.mzstatic.com/image/thumb/${id}/600x600bb.jpg`,
    ...over,
  };
}

/** Old moments on distinct, non-anniversary days in 2025. */
function oldMoments(n: number): WidgetSourceMoment[] {
  return Array.from({ length: n }, (_, i) => m(`old${i}`, addDays("2025-01-01", i * 3)));
}

const pick = (moments: WidgetSourceMoment[], over: Partial<Parameters<typeof pickWidgetMoments>[0]> = {}) =>
  pickWidgetMoments({ moments, shown: {}, today: TODAY, seed: "user-1", ...over });

describe("day helpers", () => {
  it("adds days across months, years and DST", () => {
    expect(addDays("2026-11-23", 7)).toBe("2026-11-30");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats the long date and the anniversary", () => {
    expect(longDate("2023-03-12")).toBe("March 12, 2023");
    expect(yearsAgoToday(1)).toBe("A year ago today");
    expect(yearsAgoToday(3)).toBe("3 years ago today");
  });

  it("reads momentDate, else the local day it was created", () => {
    expect(momentDay({ momentDate: "2024-05-06", createdAt: null })).toBe("2024-05-06");
    expect(momentDay({ momentDate: null, createdAt: new Date(2024, 4, 6, 23, 30).toISOString() })).toBe("2024-05-06");
    expect(momentDay({ momentDate: null, createdAt: null })).toBeNull();
    expect(momentDay({ momentDate: "garbage", createdAt: "also garbage" })).toBeNull();
  });

  it("hashes stably", () => {
    expect(hash("a")).toBe(hash("a"));
    expect(hash("a")).not.toBe(hash("b"));
  });
});

describe("firstLine", () => {
  it("takes the first non-empty line, whitespace collapsed", () => {
    expect(firstLine("\n\n  The   drive home  \nsecond line")).toBe("The drive home");
  });

  it("is null for nothing", () => {
    expect(firstLine(null)).toBeNull();
    expect(firstLine(undefined)).toBeNull();
    expect(firstLine("  \n \n")).toBeNull();
  });

  it("cuts long lines at a word, with an ellipsis, within the limit", () => {
    const long = "We drove all night with the windows down and this song on repeat until the sun came up over the hills";
    const line = firstLine(long)!;
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith("…")).toBe(true);
    expect(long.startsWith(line.slice(0, -1))).toBe(true);
    expect(line.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("cuts a single long word where it is", () => {
    const line = firstLine("a".repeat(200), 20)!;
    expect(line).toBe(`${"a".repeat(19)}…`);
  });

  it("leaves a line at the limit alone", () => {
    expect(firstLine("x".repeat(80))).toBe("x".repeat(80));
  });
});

describe("pickWidgetMoments", () => {
  it("picks one entry for each of the next 7 days", () => {
    const picks = pick(oldMoments(20));
    expect(picks.map((p) => p.day)).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
    ]);
  });

  it("prefers the same day in an earlier year", () => {
    const anniversary = m("ann", "2023-11-25");
    const picks = pick([...oldMoments(20), anniversary]);
    const day = picks.find((p) => p.day === "2026-11-25")!;
    expect(day.momentId).toBe("ann");
    expect(day.onThisDay).toBe(true);
    expect(day.dateLabel).toBe("3 years ago today");
    expect(day.dateText).toBe("November 25, 2023");
    // Only on its day.
    expect(picks.filter((p) => p.momentId === "ann")).toHaveLength(1);
  });

  it("says 'A year ago today' for last year", () => {
    const picks = pick([...oldMoments(10), m("ann", "2025-11-23")]);
    expect(picks[0]).toMatchObject({ momentId: "ann", dateLabel: "A year ago today" });
  });

  it("doesn't count the same day this year as an anniversary", () => {
    const thisYear = m("now", "2026-11-23");
    const picks = pick([...oldMoments(10), thisYear]);
    expect(picks.some((p) => p.momentId === "now")).toBe(false);
  });

  it("chooses among several anniversaries on the same day, the same way each time", () => {
    const anns = [m("a1", "2020-11-23"), m("a2", "2022-11-23"), m("a3", "2024-11-23")];
    const first = pick([...oldMoments(10), ...anns])[0];
    expect(["a1", "a2", "a3"]).toContain(first.momentId);
    expect(pick([...anns, ...oldMoments(10)].reverse())[0].momentId).toBe(first.momentId);
  });

  it("falls back to moments at least 30 days old, labelled with their date", () => {
    const recent = m("recent", addDays(TODAY, -(MIN_AGE_DAYS - 1)));
    const old = m("old", addDays(TODAY, -MIN_AGE_DAYS - 10));
    const picks = pick([recent, old], { days: 1 });
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ momentId: "old", onThisDay: false, dateLabel: longDate(old.momentDate!) });
  });

  it("counts the 30 days from the day being picked", () => {
    // 29 days old today, 30 tomorrow.
    const edge = m("edge", addDays(TODAY, -(MIN_AGE_DAYS - 1)));
    const picks = pick([edge], { days: 2 });
    expect(picks.map((p) => p.day)).toEqual(["2026-11-24"]);
  });

  it("leaves days out when nothing is old enough", () => {
    expect(pick([m("new", addDays(TODAY, -3))])).toEqual([]);
    expect(pick([])).toEqual([]);
  });

  it("doesn't repeat a moment within the week when there are enough", () => {
    const ids = pick(oldMoments(7)).map((p) => p.momentId);
    expect(new Set(ids).size).toBe(7);
  });

  it("repeats only when it has to, the longest-shown-ago first", () => {
    const picks = pick(oldMoments(3));
    expect(picks).toHaveLength(7);
    const ids = picks.map((p) => p.momentId);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    // Never the same moment two days running.
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it("avoids moments shown recently", () => {
    const moments = oldMoments(30);
    const shown: Record<string, string> = {};
    for (let i = 0; i < 20; i++) shown[addDays(TODAY, -1 - i)] = moments[i].id;
    const picks = pick(moments, { shown });
    const recent = new Set(Object.values(shown));
    for (const p of picks) expect(recent.has(p.momentId)).toBe(false);
  });

  it("forgets what was shown more than 30 days before the day", () => {
    const a = m("a", "2025-01-10");
    const b = m("b", "2025-02-10");
    // a was shown 40 days ago, b yesterday: a is fresh again.
    const picks = pick([a, b], { days: 1, shown: { [addDays(TODAY, -40)]: "a", [addDays(TODAY, -1)]: "b" } });
    expect(picks[0].momentId).toBe("a");
  });

  it("ignores 'shown' entries for today or later (those are plans, not history)", () => {
    const moments = oldMoments(10);
    const base = pick(moments);
    const withPlans = pick(moments, { shown: Object.fromEntries(base.map((p) => [p.day, p.momentId])) });
    expect(withPlans).toEqual(base);
  });

  it("gives the same picks for the same day and user", () => {
    const moments = oldMoments(40);
    expect(pick(moments)).toEqual(pick([...moments].reverse()));
  });

  it("differs between users", () => {
    const moments = oldMoments(40);
    const a = pick(moments, { seed: "user-1" }).map((p) => p.momentId);
    const b = pick(moments, { seed: "user-2" }).map((p) => p.momentId);
    expect(a).not.toEqual(b);
  });

  it("keeps tomorrow's pick when worked out again tomorrow", () => {
    const moments = oldMoments(40);
    const today = pick(moments);
    const shown = { [today[0].day]: today[0].momentId };
    const tomorrow = pick(moments, { today: addDays(TODAY, 1), shown });
    expect(tomorrow.slice(0, 6)).toEqual(today.slice(1));
  });

  it("keeps a day's pick when a moment that loses the draw is added", () => {
    const moments = oldMoments(20);
    const before = pick(moments);
    // Add moments until one doesn't win any day: the others stay put.
    for (let i = 0; i < 50; i++) {
      const extra = m(`extra${i}`, "2024-06-01");
      const after = pick([...moments, extra]);
      if (!after.some((p) => p.momentId === extra.id)) {
        expect(after).toEqual(before);
        return;
      }
    }
    throw new Error("every extra moment won a day");
  });

  it("leaves the words to the writer, which reads them only when allowed", () => {
    expect(pick([m("w", "2023-11-23")])[0].line).toBeNull();
  });

  it("shows a moment with no moment date on the day it was written", () => {
    const undated = m("u", null, { createdAt: new Date(2023, 10, 23, 21, 0).toISOString() });
    expect(pick([undated], { days: 1 })[0]).toMatchObject({ momentId: "u", onThisDay: true });
  });

  it("asks for 512 px Apple artwork and passes other artwork through", () => {
    const apple = pick([m("a", "2023-11-23")])[0];
    expect(apple.artworkUrl).toBe("https://is1-ssl.mzstatic.com/image/thumb/a/512x512bb.jpg");
    const spotify = pick([m("s", "2023-11-23", { artworkUrl: "https://i.scdn.co/image/abc" })])[0];
    expect(spotify.artworkUrl).toBe("https://i.scdn.co/image/abc");
    expect(pick([m("n", "2023-11-23", { artworkUrl: "" })])[0].artworkUrl).toBeNull();
  });

  it("skips moments with no date and duplicate ids", () => {
    const picks = pick([m("x", null), m("d", "2023-11-23"), m("d", "2023-11-23")], { days: 1 });
    expect(picks).toHaveLength(1);
    expect(picks[0].momentId).toBe("d");
  });
});

describe("rollShown", () => {
  it("moves past plans into history and drops what's too old to matter", () => {
    const shown = { "2026-09-01": "ancient", "2026-11-10": "a" };
    const planned = { "2026-11-21": "b", "2026-11-22": "c", "2026-11-23": "today", "2026-11-24": "later" };
    expect(rollShown(shown, planned, TODAY)).toEqual({ "2026-11-10": "a", "2026-11-21": "b", "2026-11-22": "c" });
  });
});
