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
