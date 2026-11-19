import { describe, expect, it } from "vitest";
import { buildJournalHtml, compareBookOrder, paragraphs, type ExportMoment } from "../journalExport";

const m = (date: string, over: Partial<ExportMoment> = {}): ExportMoment => ({
  songTitle: `Song ${date}`,
  songArtist: "Artist",
  songArtworkUrl: "https://is1.mzstatic.com/a/200x200bb.jpg",
  reflectionText: "",
  moods: [],
  people: [],
  location: null,
  momentDate: date,
  createdAt: `${date}T12:00:00Z`,
  photoUrls: [],
  ...over,
});

const now = new Date(2026, 10, 16);

describe("buildJournalHtml", () => {
  it("titles the book with the owner's name and counts moments", () => {
    const html = buildJournalHtml([m("2026-01-01"), m("2026-02-01")], { ownerName: "Sam", now });
    expect(html).toContain("Sam’s soundtrack");
    expect(html).toContain("2 moments");
    expect(html).toContain("Exported November 16, 2026");
  });

  it("orders moments oldest first under year and month heads", () => {
    const html = buildJournalHtml([m("2026-03-05"), m("2025-12-01"), m("2026-01-09")], { now });
    const order = ["Song 2025-12-01", "Song 2026-01-09", "Song 2026-03-05"].map((t) => html.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/class="year"/g)).toHaveLength(2);
    expect(html.match(/class="month"/g)).toHaveLength(3);
  });

  it("escapes everything the user wrote", () => {
    const html = buildJournalHtml([m("2026-01-01", { reflectionText: "<script>x</script> & \"quotes\"", songTitle: "A<B" })], { now });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&lt;B");
  });

  it("writes when, where and who, and moods as words", () => {
    const html = buildJournalHtml(
      [m("2026-09-21", { location: "Denver, CO", people: ["Mom", "Dad"], moods: ["joyful", "nostalgic"] })],
      { now, moodLabel: (v) => v.charAt(0).toUpperCase() + v.slice(1) }
    );
    expect(html).toContain("Monday, September 21, 2026 · Denver, CO · With Mom and Dad");
    expect(html).toContain("Joyful · nostalgic");
  });

  it("uses larger artwork and includes up to four photos", () => {
    const photos = ["a", "b", "c", "d", "e"].map((x) => `https://p/${x}.jpg`);
    const html = buildJournalHtml([m("2026-01-01", { photoUrls: photos })], { now });
    expect(html).toContain("300x300bb.jpg");
    expect(html).toContain("https://p/d.jpg");
    expect(html).not.toContain("https://p/e.jpg");
  });

  it("falls back to the saved date when a moment has none", () => {
    const html = buildJournalHtml([m("2026-04-02", { momentDate: null })], { now });
    expect(html).toContain("April 2, 2026");
  });

  it("handles an empty journal", () => {
    expect(buildJournalHtml([], { now })).toContain("0 moments");
  });

  it("prints moments that tie on date and time the same way whatever order they arrive in", () => {
    const a = m("2026-05-01", { id: "a", songTitle: "Tie A" });
    const b = m("2026-05-01", { id: "b", songTitle: "Tie B" });
    expect(buildJournalHtml([b, a], { now })).toBe(buildJournalHtml([a, b], { now }));
    const html = buildJournalHtml([b, a], { now });
    expect(html.indexOf("Tie A")).toBeLessThan(html.indexOf("Tie B"));
  });
});

describe("compareBookOrder", () => {
  it("goes by day, then when it was written, then id", () => {
    const sorted = [
      m("2026-05-02", { id: "x", createdAt: "2026-05-02T08:00:00Z" }),
      m("2026-05-01", { id: "b", createdAt: "2026-05-01T09:00:00Z" }),
      m("2026-05-01", { id: "a", createdAt: "2026-05-01T09:00:00Z" }),
      m("2026-05-01", { id: "c", createdAt: "2026-05-01T07:00:00Z" }),
    ].sort(compareBookOrder);
    expect(sorted.map((x) => x.id)).toEqual(["c", "a", "b", "x"]);
  });

  it("places an undated moment on the day it was saved", () => {
    const undated = m("2026-05-03", { id: "u", momentDate: null, createdAt: "2026-05-03T10:00:00Z" });
    const sorted = [m("2026-05-04", { id: "late" }), undated, m("2026-05-02", { id: "early" })].sort(compareBookOrder);
    expect(sorted.map((x) => x.id)).toEqual(["early", "u", "late"]);
  });
});

describe("paragraphs", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(paragraphs("One\ntwo\n\nThree")).toBe("<p>One<br>two</p><p>Three</p>");
  });
});
