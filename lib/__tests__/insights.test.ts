import { describe, expect, it } from "vitest";
import {
  artistHighlights,
  comingBack,
  comingBackWhen,
  decadeInSentence,
  genreHeadline,
  genreInSentence,
  insightsSummary,
  journalInsights,
  normalizeTimeOfDay,
  periodHeadline,
  repeatArtists,
  resonates,
  writingPattern,
  type InsightMoment,
} from "@/lib/insights";

const m = (over: Partial<InsightMoment>): InsightMoment => ({
  momentDate: "2026-11-01",
  songTitle: "Song",
  songArtist: "Artist",
  songArtworkUrl: "",
  moods: [],
  people: [],
  ...over,
});

describe("journalInsights", () => {
  it("is empty for no moments", () => {
    expect(journalInsights([])).toEqual({
      moments: 0,
      songs: 0,
      artists: 0,
      topArtists: [],
      featuring: [],
      moods: [],
    });
  });

  it("counts distinct songs and artists, case and spaces aside", () => {
    const i = journalInsights([
      m({ songTitle: "Dreams", songArtist: "Fleetwood Mac" }),
      m({ songTitle: "dreams ", songArtist: "fleetwood mac" }),
      m({ songTitle: "Dreams", songArtist: "The Cranberries" }),
    ]);
    expect(i.moments).toBe(3);
    expect(i.songs).toBe(2); // the same title by two artists is two songs
    expect(i.artists).toBe(2);
  });

  it("ranks artists by moments, keeping the most recent artwork and first-seen name", () => {
    const i = journalInsights([
      m({ songArtist: "Bon Iver", songArtworkUrl: "" }),
      m({ songArtist: "Fleetwood Mac", songArtworkUrl: "fm-new" }),
      m({ songArtist: "bon iver", songArtworkUrl: "bi-old" }),
      m({ songArtist: "Fleetwood Mac", songArtworkUrl: "fm-old" }),
      m({ songArtist: "Frank Ocean", songArtworkUrl: "fo" }),
    ]);
    expect(i.topArtists.map((a) => [a.name, a.count, a.artworkUrl])).toEqual([
      ["Bon Iver", 2, "bi-old"],
      ["Fleetwood Mac", 2, "fm-new"],
      ["Frank Ocean", 1, "fo"],
    ]);
  });

  it("counts a person or mood once per moment", () => {
    const i = journalInsights([
      m({ people: ["Maya", "maya ", "Sam"], moods: ["joyful", "joyful"] }),
      m({ people: ["Maya"], moods: ["peaceful", "joyful"] }),
    ]);
    expect(i.featuring).toEqual([
      { value: "Maya", count: 2 },
      { value: "Sam", count: 1 },
    ]);
    expect(i.moods).toEqual([
      { value: "joyful", count: 2 },
      { value: "peaceful", count: 1 },
    ]);
  });

  it("ignores blank songs, artists and people", () => {
    const i = journalInsights([m({ songTitle: "", songArtist: " ", people: ["", "  "] })]);
    expect(i).toMatchObject({ moments: 1, songs: 0, artists: 0, topArtists: [], featuring: [] });
  });
});

describe("insightsSummary", () => {
  it("pluralizes each count", () => {
    expect(insightsSummary({ moments: 1, songs: 2, artists: 1 })).toBe("1 moment · 2 songs · 1 artist");
    expect(insightsSummary({ moments: 1200, songs: 900, artists: 300 })).toBe(
      "1,200 moments · 900 songs · 300 artists"
    );
  });
});

describe("repeatArtists", () => {
  it("keeps only artists with two or more moments, capped", () => {
    const i = journalInsights([
      m({ songArtist: "A" }),
      m({ songArtist: "B" }),
      m({ songArtist: "A" }),
      m({ songArtist: "C" }),
      m({ songArtist: "C" }),
      m({ songArtist: "C" }),
    ]);
    expect(repeatArtists(i, 5).map((a) => [a.name, a.count])).toEqual([
      ["C", 3],
      ["A", 2],
    ]);
    expect(repeatArtists(i, 1).map((a) => a.name)).toEqual(["C"]);
    expect(repeatArtists(journalInsights([m({ songArtist: "Solo" })]), 5)).toEqual([]);
  });
});

describe("artistHighlights", () => {
  it("ranks repeats when there are any", () => {
    const i = journalInsights([m({ songArtist: "A" }), m({ songArtist: "B" }), m({ songArtist: "A" })]);
    const h = artistHighlights(i, 5);
    expect(h.kind).toBe("repeats");
    expect(h.artists.map((a) => a.name)).toEqual(["A"]);
  });

  it("falls back to the most recent artists, with their latest song, when nobody repeats", () => {
    const i = journalInsights([
      m({ songArtist: "Newest", songTitle: "Latest" }),
      m({ songArtist: "Middle", songTitle: "Mid" }),
      m({ songArtist: "Oldest", songTitle: "First" }),
    ]);
    const h = artistHighlights(i, 2);
    expect(h.kind).toBe("recent");
    expect(h.artists.map((a) => [a.name, a.latestSong])).toEqual([
      ["Newest", "Latest"],
      ["Middle", "Mid"],
    ]);
  });
});

describe("comingBack", () => {
  const s = (title: string, artist: string, momentDate: string | null, songArtworkUrl = "") =>
    m({ songTitle: title, songArtist: artist, momentDate, songArtworkUrl });

  it("is empty with no moments, or when no song repeats", () => {
    expect(comingBack([], 5)).toEqual([]);
    expect(comingBack([s("A", "X", "2026-01-01"), s("B", "X", "2026-01-02")], 5)).toEqual([]);
  });

  it("keeps songs with two or more moments, with their dates oldest first", () => {
    const out = comingBack(
      [
        s("Dreams", "Fleetwood Mac", "2026-11-01", "new"),
        s("Solo", "Frank Ocean", "2026-10-01"),
        s("Dreams", "Fleetwood Mac", "2023-07-04", "old"),
        s("Dreams", "Fleetwood Mac", "2019-03-02", "older"),
      ],
      5
    );
    expect(out).toEqual([
      {
        title: "Dreams",
        artist: "Fleetwood Mac",
        artworkUrl: "new",
        count: 3,
        dates: ["2019-03-02", "2023-07-04", "2026-11-01"],
      },
    ]);
  });

  it("groups case and spaces aside, naming the song as its most recent moment stores it", () => {
    const out = comingBack(
      [s("dreams ", "fleetwood mac", "2026-01-01"), s("Dreams", " Fleetwood Mac", "2026-05-01")],
      5
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "Dreams", artist: " Fleetwood Mac", count: 2 });
  });

  it("treats the same title by different artists as different songs", () => {
    const out = comingBack(
      [
        s("Dreams", "Fleetwood Mac", "2026-01-01"),
        s("Dreams", "The Cranberries", "2026-01-02"),
        s("Dreams", "The Cranberries", "2025-01-02"),
      ],
      5
    );
    expect(out.map((x) => [x.artist, x.count])).toEqual([["The Cranberries", 2]]);
  });

  it("orders by moments, then most recently written to, then first seen", () => {
    const out = comingBack(
      [
        s("Old pair", "A", "2020-01-01"),
        s("Recent pair", "B", "2026-06-01"),
        s("Trio", "C", "2018-01-01"),
        s("Old pair", "A", "2019-01-01"),
        s("Recent pair", "B", "2015-01-01"),
        s("Trio", "C", "2017-01-01"),
        s("Trio", "C", "2016-01-01"),
        s("Same day 1", "D", "2021-01-01"),
        s("Same day 2", "E", "2021-01-01"),
        s("Same day 1", "D", null),
        s("Same day 2", "E", null),
      ],
      10
    );
    expect(out.map((x) => x.title)).toEqual(["Trio", "Recent pair", "Same day 1", "Same day 2", "Old pair"]);
  });

  it("counts undated moments but leaves them out of dates and below dated ones for recency", () => {
    const out = comingBack(
      [s("Undated", "A", null), s("Dated", "B", "2001-01-01"), s("Undated", "A", null), s("Dated", "B", "2000-01-01")],
      5
    );
    expect(out.map((x) => [x.title, x.count, x.dates])).toEqual([
      ["Dated", 2, ["2000-01-01", "2001-01-01"]],
      ["Undated", 2, []],
    ]);
  });

  it("takes artwork from the most recent moment that has any", () => {
    const out = comingBack(
      [
        s("S", "A", null, "undated"),
        s("S", "A", "2026-01-01", ""),
        s("S", "A", "2025-01-01", "dated"),
        s("S", "A", "2024-01-01", "older"),
      ],
      5
    );
    expect(out[0].artworkUrl).toBe("dated");
    expect(comingBack([s("S", "A", "2026-01-01"), s("S", "A", null)], 5)[0].artworkUrl).toBeNull();
  });

  it("skips moments with no title or no artist, and caps at max", () => {
    expect(comingBack([s("", "A", null), s(" ", "A", null), s("T", "", null), s("T", "  ", null)], 5)).toEqual([]);
    const many = ["A", "B", "C"].flatMap((t) => [s(t, "X", "2026-01-01"), s(t, "X", "2025-01-01")]);
    expect(comingBack(many, 2).map((x) => x.title)).toEqual(["A", "B"]);
  });
});

describe("comingBackWhen", () => {
  const now = new Date(2026, 10, 20);

  it('lists the years when the dates span years, this one as "this year"', () => {
    expect(comingBackWhen(["2019-03-02", "2023-07-04", "2026-11-01"], 3, now)).toBe("2019 · 2023 · this year");
    expect(comingBackWhen(["2023-07-04", "2019-03-02", "2019-05-02"], 3, now)).toBe("2019 · 2023");
  });

  it("shows the span past four years", () => {
    expect(comingBackWhen(["2012-01-01", "2014-01-01", "2016-01-01", "2020-01-01", "2026-01-01"], 5, now)).toBe(
      "2012 to this year"
    );
    expect(comingBackWhen(["2012-01-01", "2014-01-01", "2016-01-01", "2018-01-01", "2020-01-01"], 5, now)).toBe(
      "2012 to 2020"
    );
  });

  it("lists the months within one year, adding the year unless it's this one", () => {
    expect(comingBackWhen(["2026-11-03", "2026-03-01", "2026-07-09", "2026-07-20"], 4, now)).toBe(
      "March · July · November"
    );
    expect(comingBackWhen(["2021-03-01", "2021-07-09"], 2, now)).toBe("March · July 2021");
    expect(comingBackWhen(["2026-02-01", "2026-03-01", "2026-05-01", "2026-08-01", "2026-11-01"], 5, now)).toBe(
      "February to November"
    );
  });

  it("falls back to a count within one month or without dates", () => {
    expect(comingBackWhen(["2026-11-01", "2026-11-15"], 2, now)).toBe("2 times");
    expect(comingBackWhen(["2026-11-01"], 3, now)).toBe("3 times"); // the others undated
    expect(comingBackWhen([], 2, now)).toBe("2 times");
    expect(comingBackWhen([], 1, now)).toBe("1 time");
    expect(comingBackWhen(["not a date", "2026-13-01"], 2, now)).toBe("2 times");
  });
});

const g = (value: string, count: number) => ({ value, count });
const d = (decade: number, count: number) => ({ decade, count });

describe("genreInSentence", () => {
  it("lowercases ordinary genres", () => {
    expect(genreInSentence("Pop")).toBe("pop");
    expect(genreInSentence("Hip-Hop/Rap")).toBe("hip-hop/rap");
    expect(genreInSentence("Singer/Songwriter")).toBe("singer/songwriter");
    expect(genreInSentence("Children's Music")).toBe("children's music");
    expect(genreInSentence(" Alternative ")).toBe("alternative");
  });

  it("keeps Apple's spelling when a word is an abbreviation or a proper noun", () => {
    expect(genreInSentence("R&B/Soul")).toBe("R&B/Soul");
    expect(genreInSentence("K-Pop")).toBe("K-Pop");
    expect(genreInSentence("J-Pop")).toBe("J-Pop");
    expect(genreInSentence("Latin")).toBe("Latin");
    expect(genreInSentence("Pop Latino")).toBe("Pop Latino");
    expect(genreInSentence("Christian & Gospel")).toBe("Christian & Gospel");
    expect(genreInSentence("Christmas")).toBe("Christmas");
  });
});

describe("genreHeadline", () => {
  it("says nothing under three moments with a genre", () => {
    expect(genreHeadline([])).toBeNull();
    expect(genreHeadline([g("Pop", 2)])).toBeNull();
  });

  it("one genre throughout", () => {
    expect(genreHeadline([g("Pop", 3)])).toBe("All pop");
  });

  it("a clear leader: mostly from half, most often below", () => {
    expect(genreHeadline([g("Pop", 4), g("Rock", 1), g("Jazz", 1)])).toBe("Mostly pop");
    expect(genreHeadline([g("Pop", 3), g("Rock", 1), g("Jazz", 1), g("Folk", 1), g("Soul", 1)])).toBe(
      "Most often pop"
    );
  });

  it("names a runner-up with at least 2 and half the leader, ahead of third", () => {
    expect(genreHeadline([g("Pop", 5), g("Hip-Hop/Rap", 3), g("Rock", 1)])).toBe("Mostly pop and hip-hop/rap");
    // Too far behind.
    expect(genreHeadline([g("Pop", 7), g("Rock", 3), g("Jazz", 1)])).toBe("Mostly pop");
    // Tied with third: neither is named.
    expect(genreHeadline([g("Pop", 4), g("Rock", 2), g("Jazz", 2)])).toBe("Mostly pop");
    // One moment isn't a runner-up.
    expect(genreHeadline([g("Pop", 2), g("Rock", 1)])).toBe("Mostly pop");
  });

  it("two tied at the top lead together", () => {
    expect(genreHeadline([g("Pop", 3), g("R&B/Soul", 3), g("Rock", 1)])).toBe("Mostly pop and R&B/Soul");
    expect(
      genreHeadline([g("Pop", 2), g("Rock", 2), g("Jazz", 1), g("Folk", 1), g("Soul", 1), g("Blues", 1), g("Funk", 1)])
    ).toBe("Most often pop and rock");
  });

  it("nobody leads: a mix", () => {
    expect(genreHeadline([g("Pop", 1), g("Rock", 1), g("Jazz", 1)])).toBe("A mix of pop, rock and jazz");
    expect(genreHeadline([g("Pop", 2), g("Rock", 2), g("Jazz", 2), g("Folk", 1)])).toBe(
      "A mix of pop, rock, jazz and more"
    );
  });
});

describe("decadeInSentence", () => {
  it("is short for the 30s to the 90s, in full otherwise", () => {
    expect(decadeInSentence(1970)).toBe("the 70s");
    expect(decadeInSentence(1930)).toBe("the 30s");
    expect(decadeInSentence(1990)).toBe("the 90s");
    expect(decadeInSentence(1920)).toBe("the 1920s");
    expect(decadeInSentence(2000)).toBe("the 2000s");
    expect(decadeInSentence(2010)).toBe("the 2010s");
  });
});

describe("periodHeadline", () => {
  it("says nothing under three moments with a release year", () => {
    expect(periodHeadline([])).toBeNull();
    expect(periodHeadline([d(2010, 1), d(1970, 1)])).toBeNull();
  });

  it("one decade throughout", () => {
    expect(periodHeadline([d(2010, 4)])).toBe("All from the 2010s");
  });

  it("a leading decade, with a soft spot when the runner-up earns it", () => {
    expect(periodHeadline([d(2010, 6), d(1970, 3), d(2000, 1)])).toBe(
      "Mostly the 2010s, with a soft spot for the 70s"
    );
    expect(periodHeadline([d(2010, 6), d(1970, 1), d(2000, 1)])).toBe("Mostly the 2010s");
    // 2 of 12 is under a fifth.
    expect(periodHeadline([d(2010, 7), d(1970, 2), d(2000, 1), d(1990, 1), d(1980, 1)])).toBe("Mostly the 2010s");
    // Runner-up tied with third: no soft spot.
    expect(periodHeadline([d(2010, 5), d(1970, 2), d(2000, 2)])).toBe("Mostly the 2010s");
    expect(periodHeadline([d(2020, 3), d(2010, 2), d(1980, 1), d(1990, 1)])).toBe(
      "Most often the 2020s, with a soft spot for the 2010s"
    );
  });

  it("two tied at the top, oldest first", () => {
    expect(periodHeadline([d(2010, 3), d(1970, 3), d(2000, 1)])).toBe("Equally the 70s and the 2010s");
  });

  it("nobody leads: the span", () => {
    expect(periodHeadline([d(2020, 1), d(1960, 1), d(1990, 1)])).toBe("From the 60s to the 2020s");
    expect(periodHeadline([d(2020, 2), d(1980, 2), d(1990, 2)])).toBe("From the 80s to the 2020s");
  });
});

describe("resonates", () => {
  const now = new Date(2026, 10, 20);
  const s = (songGenre: string | null, songReleaseDate: string | null = null) => ({ songGenre, songReleaseDate });

  it("is null when neither genres nor release dates reach three", () => {
    expect(resonates([], now)).toBeNull();
    expect(resonates([s("Pop", "2015-01-01"), s("Rock", "1975-01-01"), s(null), s(null)], now)).toBeNull();
  });

  it("ranks genres per moment, folding Hip-Hop and Rap into Hip-Hop/Rap and ignoring Music", () => {
    const r = resonates(
      [s("Pop"), s("Hip-Hop"), s("hip-hop/rap"), s("Rap"), s("Pop"), s("Music"), s(" "), s("R&B"), s("R&B/Soul")],
      now
    );
    expect(r?.genres).toEqual([g("Hip-Hop/Rap", 3), g("Pop", 2), g("R&B/Soul", 2)]);
    expect(r?.genreLine).toBe("Most often hip-hop/rap");
  });

  it("keeps the first-seen spelling and ranks ties most recent first", () => {
    const r = resonates([s("Indie Pop"), s("Rock"), s("indie pop"), s("rock"), s("Jazz")], now);
    expect(r?.genres).toEqual([g("Indie Pop", 2), g("Rock", 2), g("Jazz", 1)]);
  });

  it("counts release decades, ignoring missing, malformed and impossible years", () => {
    const r = resonates(
      [
        s(null, "2015-06-01"),
        s(null, "2019-12-31"),
        s(null, "1977-09-29"),
        s(null, "2010-01-01"),
        s(null, "nope"),
        s(null, "1850-01-01"),
        s(null, "2099-01-01"),
        s(null, null),
      ],
      now
    );
    expect(r?.decades).toEqual([d(2010, 3), d(1970, 1)]);
    expect(r?.periodLine).toBe("Mostly the 2010s");
    expect(r?.genreLine).toBeNull();
    expect(r?.genres).toEqual([]);
  });

  it("has each half only when it has something to say", () => {
    const r = resonates([s("Pop", "2015-01-01"), s("Pop"), s("Rock")], now);
    expect(r?.genreLine).toBe("Mostly pop");
    expect(r?.periodLine).toBeNull();
    expect(r?.decades).toEqual([]);
  });
});

describe("normalizeTimeOfDay", () => {
  it("reads the saved values in any case", () => {
    expect(normalizeTimeOfDay("Morning")).toBe("morning");
    expect(normalizeTimeOfDay("afternoon")).toBe("afternoon");
    expect(normalizeTimeOfDay(" Evening ")).toBe("evening");
    expect(normalizeTimeOfDay("Late Night")).toBe("night");
    expect(normalizeTimeOfDay("night")).toBe("night");
    expect(normalizeTimeOfDay("dawn")).toBeNull();
    expect(normalizeTimeOfDay(null)).toBeNull();
    expect(normalizeTimeOfDay(undefined)).toBeNull();
  });
});

describe("writingPattern", () => {
  // 2026-11-01 is a Sunday; 2026-11-02 to 07 run Monday to Saturday.
  const w = (timeOfDay: string | null, momentDate: string | null = null) => ({ timeOfDay, momentDate });
  const times = (spec: Record<string, number>) =>
    Object.entries(spec).flatMap(([t, n]) => Array.from({ length: n }, () => w(t)));
  const days = (dates: string[]) => dates.map((date) => w(null, date));

  it("is null with nothing to say", () => {
    expect(writingPattern([])).toBeNull();
    expect(writingPattern(times({ Evening: 4 }))).toBeNull(); // under five
  });

  it("names a time of day that clearly leads, with the times used in day order", () => {
    const p = writingPattern(times({ Evening: 3, Morning: 1, Afternoon: 1 }));
    expect(p?.line).toBe("Mostly in the evening");
    expect(p?.times).toEqual([
      { value: "morning", label: "Morning", count: 1 },
      { value: "afternoon", label: "Afternoon", count: 1 },
      { value: "evening", label: "Evening", count: 3 },
    ]);
    expect(writingPattern(times({ "Late Night": 4, Evening: 1 }))?.line).toBe("Mostly late at night");
  });

  it("needs 40%, at least 3, and 1.5× the next", () => {
    // 4 vs 3 isn't 1.5×: spread over three times instead.
    expect(writingPattern(times({ Evening: 4, Morning: 3, Afternoon: 1 }))?.line).toBe("All through the day");
    // 3 of 8 is under 40%.
    expect(writingPattern(times({ Evening: 3, Morning: 2, Afternoon: 2, "Late Night": 1 }))?.line).toBe(
      "All through the day"
    );
    // Two times, neither clearly ahead: nothing to say.
    expect(writingPattern(times({ Evening: 3, Morning: 3 }))).toBeNull();
  });

  it("names a weekday that clearly leads, from seven dated moments", () => {
    const sundays = ["2026-11-01", "2026-11-08", "2026-11-15"];
    expect(writingPattern(days([...sundays, "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]))?.line).toBe(
      "Often on Sundays"
    );
    // Six isn't enough.
    expect(writingPattern(days([...sundays, "2026-11-02", "2026-11-03", "2026-11-04"]))).toBeNull();
  });

  it("falls back to weekends when Saturdays and Sundays together have half", () => {
    const p = writingPattern(
      days(["2026-11-01", "2026-11-08", "2026-11-07", "2026-11-14", "2026-11-02", "2026-11-03", "2026-11-04"])
    );
    expect(p?.line).toBe("Often on weekends");
  });

  it("joins a time and a day", () => {
    const sundays = ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"];
    const meta = [
      ...sundays.map((date) => w("Evening", date)),
      w("Evening", "2026-11-02"),
      w("Morning", "2026-11-03"),
      w("Afternoon", "2026-11-04"),
    ];
    expect(writingPattern(meta)?.line).toBe("Mostly in the evening, often on Sundays");
  });

  it("ignores undated and malformed dates", () => {
    expect(
      writingPattern(days(["bad", "2026-02-30", "", "2026-13-01", "2026-11-01", "2026-11-08", "2026-11-15"]))
    ).toBeNull();
  });

  it("finds the busiest month only across a year or more", () => {
    const rest = ["2025-01-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", "2025-08-01", "2025-09-02"];
    const p = writingPattern(days(["2024-11-02", "2025-11-03", "2025-11-12", "2025-11-20", "2024-12-01", ...rest]));
    expect(p?.busiestMonth).toBe("November");
    // The same counts inside one year say nothing.
    const sameYear = writingPattern(
      days(["2025-11-02", "2025-11-03", "2025-11-12", "2025-11-20", "2025-10-01", ...rest])
    );
    expect(sameYear?.busiestMonth ?? null).toBeNull();
  });
});
