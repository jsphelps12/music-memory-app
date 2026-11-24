import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabaseMock";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";
import type { BrowseMeta } from "../browse";
import type { Moment } from "@/types";

const sb = createSupabaseMock();
const storage = createAsyncStorageMock();

vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
  ...storage,
}));

const { localSearchMatches, searchWhyLine, mergeSearchResults, topPeople, searchArchive, SEARCH_RESULT_LIMIT } =
  await import("../archiveSearch");
const { MOODS } = await import("@/constants/Moods");

const CUSTOM = { value: "custom_1700000000", label: "Road trip" };
const allMoods = [...MOODS, CUSTOM];

beforeEach(() => {
  sb.reset();
  storage.reset();
});

function meta(over: Partial<BrowseMeta> & { id: string }): BrowseMeta {
  return {
    moods: [],
    people: [],
    momentDate: "2026-01-01",
    songTitle: "Song",
    songArtist: "Artist",
    songAlbumName: "Album",
    songArtworkUrl: "",
    ...over,
  };
}

type WhyInput = Parameters<typeof searchWhyLine>[0];
function moment(over: Partial<WhyInput> = {}): WhyInput {
  return {
    songTitle: "Dreams",
    songArtist: "Fleetwood Mac",
    reflectionText: "Driving home late",
    people: [],
    location: null,
    moods: [],
    songAlbumName: "Rumours",
    ...over,
  };
}

function row(id: string, moment_date: string | null, created_at = "2026-01-01T00:00:00Z", extra: object = {}) {
  return {
    id,
    user_id: "u1",
    moment_date,
    created_at,
    song_title: "Song",
    song_artist: "Artist",
    song_album_name: "Album",
    reflection_text: "",
    people: [],
    location: null,
    ...extra,
  };
}

describe("localSearchMatches (album, people, moods on the phone)", () => {
  const library = [
    meta({ id: "album", songAlbumName: "Abbey Road" }),
    meta({ id: "person", people: ["Sam Kim", "Lisa"] }),
    meta({ id: "mood", moods: ["nostalgic"] }),
    meta({ id: "custom", moods: [CUSTOM.value] }),
    meta({ id: "accent", people: ["Zoë"], songAlbumName: "Café Society" }),
    meta({ id: "none" }),
  ];

  it("matches the album name", () => {
    expect(localSearchMatches(library, "abbey", allMoods)).toEqual(["album"]);
  });

  it("matches a person by substring of the name", () => {
    expect(localSearchMatches(library, "kim", allMoods)).toEqual(["person"]);
    expect(localSearchMatches(library, "am k", allMoods)).toEqual(["person"]);
  });

  it("matches a mood by its label, custom moods included", () => {
    expect(localSearchMatches(library, "Nostalg", allMoods)).toEqual(["mood"]);
    expect(localSearchMatches(library, "road trip", allMoods)).toEqual(["custom"]);
  });

  it("doesn't match a custom mood's stored id or a deleted custom mood", () => {
    expect(localSearchMatches(library, "custom_", allMoods)).toEqual([]);
    expect(localSearchMatches(library, "road trip", MOODS)).toEqual([]);
  });

  it("ignores case and accents, both ways, and trims", () => {
    expect(localSearchMatches(library, "  CAFE ", allMoods)).toEqual(["accent"]);
    expect(localSearchMatches(library, "zoe", allMoods)).toEqual(["accent"]);
    expect(localSearchMatches([meta({ id: "x", people: ["Zoe"] })], "Zoë", allMoods)).toEqual(["x"]);
  });

  it("doesn't match title or artist (the server does those)", () => {
    expect(localSearchMatches(library, "artist", allMoods)).toEqual([]);
  });

  it("matches nothing for an empty query", () => {
    expect(localSearchMatches(library, "   ", allMoods)).toEqual([]);
  });

  it("keeps library order and stops at the limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => meta({ id: `m${i}`, people: ["Sam"] }));
    expect(localSearchMatches(many, "sam", allMoods, 3)).toEqual(["m0", "m1", "m2"]);
  });
});

describe("searchWhyLine", () => {
  it("says who, for a people match", () => {
    expect(searchWhyLine(moment({ people: ["Sam", "Alex"] }), "sam", allMoods)).toBe("With Sam");
  });

  it("says where, for a place match", () => {
    expect(searchWhyLine(moment({ location: "Ocean Beach" }), "ocean", allMoods)).toBe("At Ocean Beach");
  });

  it("names the mood by its label, custom moods in their own case", () => {
    expect(searchWhyLine(moment({ moods: ["nostalgic"] }), "nostalgic", allMoods)).toBe("Nostalgic");
    expect(searchWhyLine(moment({ moods: [CUSTOM.value] }), "trip", allMoods)).toBe("Road trip");
  });

  it("names the album", () => {
    expect(searchWhyLine(moment(), "rumou", allMoods)).toBe("From Rumours");
  });

  it("is null when the title, artist or words also match", () => {
    const both = moment({ people: ["Mac"], location: "Mac's" });
    expect(searchWhyLine(both, "mac", allMoods)).toBeNull(); // artist
    expect(searchWhyLine(moment({ people: ["Dreams"] }), "dreams", allMoods)).toBeNull(); // title
    expect(searchWhyLine(moment({ people: ["Home"] }), "home", allMoods)).toBeNull(); // words
  });

  it("puts people before the place, the place before the mood", () => {
    const m = moment({ people: ["Bea"], location: "Beach house", moods: [] });
    expect(searchWhyLine(m, "bea", allMoods)).toBe("With Bea");
    expect(searchWhyLine(moment({ location: "Joyful Café", moods: ["joyful"] }), "joy", allMoods)).toBe(
      "At Joyful Café"
    );
  });

  it("ignores accents and case", () => {
    expect(searchWhyLine(moment({ location: "Café Luna" }), "CAFE", allMoods)).toBe("At Café Luna");
    expect(searchWhyLine(moment({ people: ["José"] }), "jose", allMoods)).toBe("With José");
  });

  it("is null for an empty query or no match", () => {
    expect(searchWhyLine(moment({ people: ["Sam"] }), "  ", allMoods)).toBeNull();
    expect(searchWhyLine(moment(), "zzz", allMoods)).toBeNull();
  });
});

describe("mergeSearchResults", () => {
  const m = (id: string, momentDate: string | null, createdAt = "2026-01-01T00:00:00Z") =>
    ({ id, momentDate, createdAt }) as Moment;

  it("keeps one per id and puts them in library order, undated last", () => {
    const server = [m("a", "2026-03-01"), m("b", "2026-01-01")];
    const local = [m("u", null), m("b", "2026-01-01"), m("c", "2026-02-01")];
    expect(mergeSearchResults(server, local).map((x) => x.id)).toEqual(["a", "c", "b", "u"]);
  });

  it("stops at the limit", () => {
    const server = [m("a", "2026-03-01"), m("b", "2026-01-01")];
    const local = [m("c", "2026-02-01")];
    expect(mergeSearchResults(server, local, 2).map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("topPeople", () => {
  it("is the names written about most, one per moment, ties to the most recent", () => {
    const library = [
      meta({ id: "1", people: ["Alex", "sam "] }),
      meta({ id: "2", people: ["Sam", "Sam"] }),
      meta({ id: "3", people: ["Jo"] }),
      meta({ id: "4", people: ["Jo", "Sam"] }),
    ];
    expect(topPeople(library)).toEqual(["sam", "Jo", "Alex"]);
  });

  it("is empty with no people and respects max", () => {
    expect(topPeople([meta({ id: "1" })])).toEqual([]);
    expect(topPeople([meta({ id: "1", people: ["A", "B", "C"] })], 2)).toEqual(["A", "B"]);
  });
});

describe("searchArchive", () => {
  it("does nothing for an empty query", async () => {
    expect(await searchArchive("u1", "  ", ["x"], allMoods)).toEqual([]);
    expect(sb.queries).toHaveLength(0);
  });

  it("asks the server in library order and reads only phone matches by id", async () => {
    sb.queueData([row("s1", "2026-03-01", undefined, { song_title: "Sam's Song" })]);
    sb.queueData([row("l1", "2026-02-01", undefined, { people: ["Sam"] })]);
    const results = await searchArchive("u1", "sam", ["l1"], allMoods);

    const [server, byId] = sb.queries;
    expect(server.chain.find((c) => c.method === "or")?.args[0]).toContain('location.ilike."%sam%"');
    expect(server.chain.filter((c) => c.method === "order").map((c) => c.args[0])).toEqual([
      "moment_date",
      "created_at",
      "id",
    ]);
    expect(server.chain.find((c) => c.method === "limit")?.args[0]).toBe(SEARCH_RESULT_LIMIT);
    expect(server.chain.find((c) => c.method === "select")?.args[0]).toContain("people, location");
    expect(byId.chain.find((c) => c.method === "in")?.args).toEqual(["id", ["l1"]]);

    expect(results.map((r) => [r.moment.id, r.why])).toEqual([
      ["s1", null],
      ["l1", "With Sam"],
    ]);
  });

  it("shows a moment found by both halves once, with no why line when the title matched", async () => {
    sb.queueData([row("both", "2026-03-01", undefined, { song_title: "Sam", people: ["Sam"] })]);
    sb.queueData([row("both", "2026-03-01", undefined, { song_title: "Sam", people: ["Sam"] })]);
    const results = await searchArchive("u1", "sam", ["both"], allMoods);
    expect(results).toHaveLength(1);
    expect(results[0].why).toBeNull();
  });

  it("explains a server match on the place", async () => {
    sb.queueData([row("p", "2026-03-01", undefined, { location: "Ocean Beach" })]);
    const results = await searchArchive("u1", "ocean", [], allMoods);
    expect(sb.queries).toHaveLength(1);
    expect(results[0].why).toBe("At Ocean Beach");
  });

  it("throws the server's error", async () => {
    sb.queueError({ message: "boom" });
    await expect(searchArchive("u1", "x", [], allMoods)).rejects.toBeTruthy();
  });
});
