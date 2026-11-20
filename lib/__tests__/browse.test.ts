import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabaseMock";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";

const sb = createSupabaseMock();
const storage = createAsyncStorageMock();

vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
  ...storage,
}));

const { fetchSongMoments, fetchAlbumMoments, fetchArtistMoments, momentSearchOrFilter } =
  await import("../browse");

beforeEach(() => {
  sb.reset();
  storage.reset();
});

describe("song / album / artist drill-downs", () => {
  it.each([
    ["song", () => fetchSongMoments("u1", "Title", "Artist")],
    ["album", () => fetchAlbumMoments("u1", "Album", "Artist")],
    ["artist", () => fetchArtistMoments("u1", "Artist")],
  ])("%s lists undated moments last", async (_name, run) => {
    sb.queueData([]);
    await run();
    const orders = sb.queries[0].chain.filter((c) => c.method === "order");
    expect(orders[0].args).toEqual([
      "moment_date",
      { ascending: false, nullsFirst: false },
    ]);
    expect(orders[1].args).toEqual(["created_at", { ascending: false }]);
  });
});

describe("momentSearchOrFilter", () => {
  it("quotes each value so commas and parentheses can't break the or-grammar", () => {
    expect(momentSearchOrFilter("Hello, Goodbye")).toBe(
      'song_title.ilike."%Hello, Goodbye%",' +
        'song_artist.ilike."%Hello, Goodbye%",' +
        'reflection_text.ilike."%Hello, Goodbye%"'
    );
    expect(momentSearchOrFilter("(I Can't Get No) Satisfaction")).toContain(
      'song_title.ilike."%(I Can\'t Get No) Satisfaction%"'
    );
  });

  it("escapes quotes and backslashes for the PostgREST quoted value", () => {
    // Text: say "hi" \ -> LIKE literal: say "hi" \\ -> quoted: say \"hi\" \\\\
    expect(momentSearchOrFilter('say "hi" \\')).toContain(
      'song_title.ilike."%say \\"hi\\" \\\\\\\\%"'
    );
  });

  it("escapes LIKE wildcards in the text so they match literally", () => {
    // LIKE literal \% becomes \\% inside the quoted value.
    expect(momentSearchOrFilter("100%_sure")).toContain(
      'song_title.ilike."%100\\\\%\\\\_sure%"'
    );
  });

  it("trims surrounding whitespace", () => {
    expect(momentSearchOrFilter("  abba ")).toContain('song_title.ilike."%abba%"');
  });
});

describe("paging past the 1000-row cap", () => {
  const metaRow = (i: number) => ({ id: `m${i}`, moods: [], people: [], moment_date: "2026-01-01" });

  it("browse metadata keeps reading until a short page", async () => {
    const { fetchBrowseMetadata } = await import("../browse");
    sb.queueData(Array.from({ length: 1000 }, (_, i) => metaRow(i)));
    sb.queueData([metaRow(1000), metaRow(1001)]);
    const meta = await fetchBrowseMetadata("u1");
    expect(meta).toHaveLength(1002);
    expect(sb.queries).toHaveLength(2);
    const ranges = sb.queries.map((q) => q.chain.find((c) => c.method === "range")?.args);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // A unique last order key, so pages can't overlap.
    const orders = sb.queries[0].chain.filter((c) => c.method === "order");
    expect(orders.at(-1)?.args[0]).toBe("id");
  });

  it.each([
    ["person", async () => (await import("../browse")).fetchPersonMoments("u1", "Sam")],
    ["year", async () => (await import("../browse")).fetchYearMoments("u1", 2024)],
    ["mood", async () => (await import("../browse")).fetchMoodMoments("u1", "happy")],
    ["song", () => fetchSongMoments("u1", "Title", "Artist")],
  ])("%s drill-down is ranged with a unique tiebreak", async (_name, run) => {
    sb.queueData([]);
    await run();
    const chain = sb.queries[0].chain;
    expect(chain.find((c) => c.method === "range")?.args).toEqual([0, 999]);
    expect(chain.filter((c) => c.method === "order").at(-1)?.args[0]).toBe("id");
  });
});

describe("browse metadata disk cache", () => {
  const KEY = "browse_meta_v2_u1";
  const AT_KEY = "browse_meta_at_v1_u1";
  const meta = [
    {
      id: "m1",
      moods: [],
      people: [],
      momentDate: "2026-01-01",
      songTitle: "T",
      songArtist: "A",
      songAlbumName: "",
      songArtworkUrl: "",
    },
  ];

  it("writes the data, then when it was fetched", async () => {
    const { writeBrowseCache, readBrowseCacheEntry } = await import("../browse");
    const before = Date.now();
    await writeBrowseCache("u1", meta);
    const entry = await readBrowseCacheEntry("u1");
    expect(entry?.data).toEqual(meta);
    expect(entry!.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it("an old cache without a timestamp reads as age unknown", async () => {
    const { readBrowseCacheEntry } = await import("../browse");
    storage.seed(KEY, JSON.stringify(meta));
    expect(await readBrowseCacheEntry("u1")).toEqual({ data: meta, fetchedAt: 0 });
  });

  it("marking it stale drops only the timestamp", async () => {
    const { writeBrowseCache, markBrowseCacheStale, readBrowseCacheEntry } = await import("../browse");
    await writeBrowseCache("u1", meta);
    await markBrowseCacheStale("u1");
    expect(storage.map.has(AT_KEY)).toBe(false);
    expect((await readBrowseCacheEntry("u1"))?.fetchedAt).toBe(0);
  });

  it("sign-out clears the timestamp too", async () => {
    const { writeBrowseCache, clearBrowseCache } = await import("../browse");
    await writeBrowseCache("u1", meta);
    await clearBrowseCache("u1");
    expect(storage.map.has(KEY)).toBe(false);
    expect(storage.map.has(AT_KEY)).toBe(false);
  });

  it("a fetch after sign-out doesn't put the library back on disk", async () => {
    const { fetchBrowseMetadata } = await import("../browse");
    // The mock's session is signed out.
    sb.queueData([{ id: "m1", moment_date: null }]);
    await fetchBrowseMetadata("u1");
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.map.has(KEY)).toBe(false);
  });
});

describe("prefetchBrowseMeta", () => {
  const meta = [{ id: "m1", moods: [], people: [], momentDate: null, songTitle: "", songArtist: "", songAlbumName: "", songArtworkUrl: "" }];

  async function setup() {
    const { QueryClient } = await import("@tanstack/react-query");
    const { prefetchBrowseMeta } = await import("../browse");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { qc, prefetchBrowseMeta };
  }

  it("a fresh disk copy paints and skips the network", async () => {
    const { qc, prefetchBrowseMeta } = await setup();
    storage.seed("browse_meta_v2_u1", JSON.stringify(meta));
    storage.seed("browse_meta_at_v1_u1", String(Date.now() - 30_000));
    await prefetchBrowseMeta(qc, "u1");
    expect(qc.getQueryData(["browseMeta", "u1"])).toEqual(meta);
    expect(sb.queries).toHaveLength(0);
  });

  it("an old disk copy paints, then refetches", async () => {
    const { qc, prefetchBrowseMeta } = await setup();
    storage.seed("browse_meta_v2_u1", JSON.stringify(meta));
    storage.seed("browse_meta_at_v1_u1", String(Date.now() - 60 * 60_000));
    sb.queueData([{ id: "m2", moment_date: null }]);
    await prefetchBrowseMeta(qc, "u1");
    expect(sb.queries).toHaveLength(1);
    expect((qc.getQueryData(["browseMeta", "u1"]) as { id: string }[])[0].id).toBe("m2");
  });

  it("a disk copy of unknown age refetches", async () => {
    const { qc, prefetchBrowseMeta } = await setup();
    storage.seed("browse_meta_v2_u1", JSON.stringify(meta));
    await prefetchBrowseMeta(qc, "u1");
    expect(sb.queries).toHaveLength(1);
  });

  it("no disk copy fetches", async () => {
    const { qc, prefetchBrowseMeta } = await setup();
    await prefetchBrowseMeta(qc, "u1");
    expect(sb.queries).toHaveLength(1);
  });
});

describe("watchBrowseMetaInvalidation", () => {
  it("a save's invalidation marks the disk copy stale, for this user only", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { watchBrowseMetaInvalidation, writeBrowseCache } = await import("../browse");
    const qc = new QueryClient();
    qc.setQueryData(["browseMeta", "u1"], []);
    qc.setQueryData(["browseMeta", "u2"], []);
    qc.setQueryData(["reflections", "u1"], []);
    await writeBrowseCache("u1", []);
    watchBrowseMetaInvalidation(qc, "u1");

    await qc.invalidateQueries({ queryKey: ["reflections", "u1"] });
    await qc.invalidateQueries({ queryKey: ["browseMeta", "u2"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.map.has("browse_meta_at_v1_u1")).toBe(true);

    await qc.invalidateQueries({ queryKey: ["browseMeta", "u1"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.map.has("browse_meta_at_v1_u1")).toBe(false);
    expect(storage.map.has("browse_meta_v2_u1")).toBe(true);
  });
});

describe("fetchBrowseMetadata song details", () => {
  it("reads the genre and release date for Insights", async () => {
    const { fetchBrowseMetadata } = await import("../browse");
    sb.queueData([{ id: "m1", song_genre: "Rock", song_release_date: "1975-10-31" }, { id: "m2" }]);
    const meta = await fetchBrowseMetadata("u1");
    expect(sb.queries[0].chain.find((c) => c.method === "select")?.args[0]).toContain("song_genre, song_release_date");
    expect(meta[0]).toMatchObject({ songGenre: "Rock", songReleaseDate: "1975-10-31" });
    expect(meta[1]).toMatchObject({ songGenre: null, songReleaseDate: null });
  });

  it("falls back to the old columns before the migration is applied", async () => {
    const { fetchBrowseMetadata } = await import("../browse");
    sb.queueError({ code: "42703", message: "column moments.song_genre does not exist" });
    sb.queueData([{ id: "m1", song_title: "T" }]);
    const meta = await fetchBrowseMetadata("u1");
    expect(sb.queries).toHaveLength(2);
    expect(sb.queries[1].chain.find((c) => c.method === "select")?.args[0]).not.toContain("song_genre");
    expect(meta[0]).toMatchObject({ id: "m1", songTitle: "T", songGenre: null });
  });

  it("still fails on other errors", async () => {
    const { fetchBrowseMetadata } = await import("../browse");
    sb.queueError("network");
    await expect(fetchBrowseMetadata("u1")).rejects.toMatchObject({ message: "network" });
    expect(sb.queries).toHaveLength(1);
  });
});
