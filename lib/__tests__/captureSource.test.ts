/**
 * capture_source: what started the capture wins; a capture that started blank
 * is credited to the way its song was picked. One case per way in listed in
 * app/help.tsx.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { CAPTURE_SOURCES, captureSourceFor } from "../captureSource";

describe("captureSourceFor", () => {
  it("credits a blank capture (+, empty state, album page) to the song pick", () => {
    expect(captureSourceFor({}, "now_playing")).toBe("now_playing");
    expect(captureSourceFor({}, "identify")).toBe("identify");
    expect(captureSourceFor({}, "search")).toBe("search");
    // A song that came in some other way with no recognised start.
    expect(captureSourceFor({}, null)).toBe("other");
  });

  it("uses the widget and Control Center for both their tiles", () => {
    expect(captureSourceFor({ source: "widget" }, "now_playing")).toBe("widget");
    expect(captureSourceFor({ source: "widget", identify: true }, "identify")).toBe("widget");
  });

  it("uses the daily check-in notification", () => {
    expect(captureSourceFor({ source: "daily_checkin" }, "now_playing")).toBe("nudge");
  });

  it("uses Last week and From before even though they hand over a song and photos", () => {
    expect(captureSourceFor({ source: "last_week", shared: true }, null)).toBe("last_week");
    expect(captureSourceFor({ source: "from_before", shared: true }, null)).toBe("from_before");
    expect(captureSourceFor({ source: "on_this_day_phone", shared: true }, null)).toBe("from_before");
  });

  it("uses Your day (Journaling Suggestions), with or without a song, even if it's then changed", () => {
    expect(captureSourceFor({ source: "your_day", shared: true }, null)).toBe("your_day");
    expect(captureSourceFor({ source: "your_day" }, null)).toBe("your_day");
    expect(captureSourceFor({ source: "your_day", shared: true }, "search")).toBe("your_day");
    expect(CAPTURE_SOURCES).toContain("your_day");
  });

  it("uses the share extension, even when the song is then changed by search", () => {
    expect(captureSourceFor({ shared: true }, null)).toBe("share");
    expect(captureSourceFor({ shared: true }, "search")).toBe("share");
    // A share arriving into a capture opened from the widget.
    expect(captureSourceFor({ shared: true, source: "widget" }, null)).toBe("share");
  });

  it("uses the long-press menu's Identify and Search, and a picked-up draft", () => {
    expect(captureSourceFor({ source: "capture_menu", identify: true }, "identify")).toBe("identify");
    expect(captureSourceFor({ source: "capture_menu", search: true }, "search")).toBe("search");
    expect(captureSourceFor({ source: "capture_menu", search: true }, "now_playing")).toBe("search");
    expect(captureSourceFor({ source: "capture_menu", draft: true }, null)).toBe("draft");
    expect(captureSourceFor({ source: "capture_menu", draft: true }, "search")).toBe("draft");
  });

  it("marks a start nobody mapped as other rather than guessing", () => {
    expect(captureSourceFor({ source: "something_new" }, "search")).toBe("other");
  });

  it("never credits an in-app capture to the background save (only quick-capture writes it)", () => {
    for (const source of [undefined, "widget", "capture_menu", "siri", "background"]) {
      for (const pick of ["now_playing", "identify", "search", null] as const) {
        expect(captureSourceFor({ source }, pick)).not.toBe("background");
      }
    }
  });

  it("only ever returns an allowed value", () => {
    const entries = [{}, { source: "widget" }, { shared: true }, { draft: true }, { source: "x" }];
    for (const entry of entries) {
      for (const pick of ["now_playing", "identify", "search", null] as const) {
        expect(CAPTURE_SOURCES).toContain(captureSourceFor(entry, pick));
      }
    }
  });
});

describe("CAPTURE_SOURCES", () => {
  it("matches the newest migration's moments_capture_source_check", () => {
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const newest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .filter((sql) => sql.includes("ADD CONSTRAINT moments_capture_source_check"))
      .pop();
    expect(newest).toBeDefined();
    const list = /capture_source IN \(([^)]*)\)/.exec(newest!)?.[1] ?? "";
    const values = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values.sort()).toEqual([...CAPTURE_SOURCES].sort());
  });
});
