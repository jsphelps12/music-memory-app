import { describe, expect, it } from "vitest";
import {
  buildYearReview,
  eligibleReviewYears,
  excerpt,
  featuredReviewYear,
  MIN_REVIEW_MOMENTS,
  monthName,
  timesWord,
  type ReviewMoment,
} from "../yearInReview";

let n = 0;
const m = (date: string, over: Partial<ReviewMoment> = {}): ReviewMoment => {
  n += 1;
  return {
    id: `m${n}`,
    songTitle: `Song ${n}`,
    songArtist: "Artist",
    songArtworkUrl: `https://art/${n}.jpg`,
    songAppleMusicId: `am${n}`,
    songSpotifyId: null,
    songPreviewUrl: `https://p/${n}.m4a`,
    reflectionText: "",
    moods: [],
    people: [],
    location: null,
    momentDate: date,
    createdAt: `${date}T12:00:00Z`,
    ...over,
  };
};

describe("buildYearReview", () => {
  it("returns null for a thin year", () => {
    const four = Array.from({ length: MIN_REVIEW_MOMENTS - 1 }, (_, i) => m(`2026-0${i + 1}-10`));
    expect(buildYearReview(four, 2026)).toBeNull();
  });

  it("only counts the requested year", () => {
    const list = [
      ...Array.from({ length: 5 }, () => m("2025-06-01")),
      m("2026-02-01"),
    ];
    expect(buildYearReview(list, 2026)).toBeNull();
    expect(buildYearReview(list, 2025)?.total).toBe(5);
  });

  it("opens on the first song and closes on the last", () => {
    const first = m("2026-01-04", { songTitle: "First" });
    const last = m("2026-12-20", { songTitle: "Last" });
    const review = buildYearReview([last, m("2026-05-01"), first, m("2026-06-01"), m("2026-07-01")], 2026)!;
    expect(review.chapters[0]).toMatchObject({ kind: "cover", total: 5 });
    expect(review.chapters[0].moment.songTitle).toBe("First");
    const closing = review.chapters[review.chapters.length - 1];
    expect(closing.kind).toBe("closing");
    expect(closing.moment.songTitle).toBe("Last");
  });

  it("finds the loudest month, the top mood, person and place", () => {
    const list = [
      m("2026-10-01", { moods: ["joyful"], people: ["Maya"], location: "Denver, CO" }),
      m("2026-10-12", { moods: ["joyful", "nostalgic"], people: ["Maya", "Ben"], location: "Denver, CO" }),
      m("2026-10-20", { moods: ["nostalgic"] }),
      m("2026-03-02", { moods: ["joyful"] }),
      m("2026-07-09"),
    ];
    const review = buildYearReview(list, 2026)!;
    const kinds = review.chapters.map((c) => c.kind);
    expect(kinds).toEqual(["cover", "month", "mood", "person", "place", "closing"]);
    expect(review.chapters.find((c) => c.kind === "month")).toMatchObject({ monthKey: "2026-10", count: 3 });
    expect(review.chapters.find((c) => c.kind === "mood")).toMatchObject({ mood: "joyful", count: 3, others: ["nostalgic"] });
    expect(review.chapters.find((c) => c.kind === "person")).toMatchObject({ person: "Maya", count: 2 });
    expect(review.chapters.find((c) => c.kind === "place")).toMatchObject({ place: "Denver, CO", count: 2 });
  });

  it("leaves out chapters with nothing true to say", () => {
    // Five months of one moment each, each with a different person: no month,
    // mood, person or place repeats, so only the cover and closing remain.
    const list = ["01", "03", "05", "07", "09"].map((mo) => m(`2026-${mo}-10`, { people: [`Person ${mo}`] }));
    const kinds = buildYearReview(list, 2026)!.chapters.map((c) => c.kind);
    expect(kinds).toEqual(["cover", "closing"]);
  });

  it("quotes the entry written about most", () => {
    const long = "Windows down on the way back from the lake. Nobody said a word for the whole song.";
    const list = [m("2026-01-01"), m("2026-02-01", { reflectionText: long }), m("2026-03-01", { reflectionText: "short" }), m("2026-04-01"), m("2026-05-01")];
    const words = buildYearReview(list, 2026)!.chapters.find((c) => c.kind === "words");
    expect(words).toMatchObject({ kind: "words", excerpt: long });
  });

  it("plays a different song on each card when it can", () => {
    const list = [
      m("2026-10-01", { moods: ["joyful"], reflectionText: "x".repeat(50) }),
      m("2026-10-02", { moods: ["joyful"] }),
      m("2026-10-03", { moods: ["joyful"] }),
      m("2026-01-01"),
      m("2026-12-01"),
    ];
    const chapters = buildYearReview(list, 2026)!.chapters;
    const month = chapters.find((c) => c.kind === "month")!;
    const mood = chapters.find((c) => c.kind === "mood")!;
    expect(month.moment.id).not.toBe(mood.moment.id);
  });

  it("uses the saved date when a moment has no moment date", () => {
    const list = Array.from({ length: 5 }, () => m("2026-04-01", { momentDate: null }));
    expect(buildYearReview(list, 2026)?.total).toBe(5);
  });

  it("counts distinct songs", () => {
    const same = { songAppleMusicId: "same" };
    const list = [m("2026-01-01", same), m("2026-02-01", same), m("2026-03-01"), m("2026-04-01"), m("2026-05-01")];
    expect(buildYearReview(list, 2026)!.chapters[0]).toMatchObject({ songCount: 4 });
  });
});

describe("excerpt", () => {
  it("keeps short text whole and flattens line breaks", () => {
    expect(excerpt("One.\n\nTwo.")).toBe("One. Two.");
  });
  it("cuts long text on a word with an ellipsis", () => {
    const out = excerpt("word ".repeat(100), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("featuredReviewYear", () => {
  it("features the ending year in December and the ended year in January", () => {
    expect(featuredReviewYear(new Date(2026, 11, 1))).toBe(2026);
    expect(featuredReviewYear(new Date(2027, 0, 31))).toBe(2026);
  });
  it("features nothing the rest of the year", () => {
    expect(featuredReviewYear(new Date(2026, 10, 30))).toBeNull();
    expect(featuredReviewYear(new Date(2027, 1, 1))).toBeNull();
  });
});

describe("eligibleReviewYears", () => {
  it("lists years with enough moments, newest first", () => {
    const meta = [
      ...Array.from({ length: 5 }, () => ({ momentDate: "2024-03-01" })),
      ...Array.from({ length: 6 }, () => ({ momentDate: "2026-03-01" })),
      ...Array.from({ length: 2 }, () => ({ momentDate: "2025-03-01" })),
      { momentDate: null },
    ];
    expect(eligibleReviewYears(meta)).toEqual([2026, 2024]);
  });
});

describe("quoted entry", () => {
  it("isn't reused by other cards when they have another choice", () => {
    const words = "A long entry about the lake and the drive back home, all of it.";
    const list = [
      m("2026-11-01", { moods: ["joyful"], people: ["Maya"], reflectionText: words }),
      m("2026-11-02", { moods: ["joyful"], people: ["Maya"] }),
      m("2026-11-03"),
      m("2026-01-01"),
      m("2026-12-30"),
    ];
    const chapters = buildYearReview(list, 2026)!.chapters;
    const quoteId = chapters.find((c) => c.kind === "words")!.moment.id;
    for (const c of chapters) {
      if (c.kind === "month" || c.kind === "mood" || c.kind === "person") expect(c.moment.id).not.toBe(quoteId);
    }
  });
});

describe("timesWord", () => {
  it("reads naturally", () => {
    expect([1, 2, 3].map(timesWord)).toEqual(["once", "twice", "3 times"]);
  });
});

describe("monthName", () => {
  it("names the month", () => {
    expect(monthName("2026-10")).toBe("October");
  });
});
