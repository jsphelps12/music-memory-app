/**
 * The iTunes lookup result → the song details saved on a moment. Insights
 * groups by these later, so a malformed field must become null rather than a
 * bad value (Postgres would also refuse an impossible date and fail the save).
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_SONG_LOOKUP,
  parseItunesLookupResult,
  pickLookupResult,
  releaseDateToDate,
  songMetadataColumns,
} from "../songMetadata";

const lookupResult = {
  wrapperType: "track",
  kind: "song",
  trackId: 1440806523,
  artistId: 3296287,
  collectionId: 1440806041,
  collectionName: "A Night at the Opera",
  previewUrl: "https://audio/preview.m4a",
  primaryGenreName: "Rock",
  releaseDate: "1975-10-31T08:00:00Z",
  trackTimeMillis: 354320,
};

describe("parseItunesLookupResult", () => {
  it("keeps the preview, album and every detail", () => {
    expect(parseItunesLookupResult(lookupResult)).toEqual({
      previewUrl: "https://audio/preview.m4a",
      albumName: "A Night at the Opera",
      genre: "Rock",
      releaseDate: "1975-10-31",
      artistId: "3296287",
      albumId: "1440806041",
      durationMs: 354320,
    });
  });

  it("turns missing fields into null", () => {
    expect(parseItunesLookupResult({ trackId: 1 })).toEqual(EMPTY_SONG_LOOKUP);
    expect(parseItunesLookupResult(null)).toEqual(EMPTY_SONG_LOOKUP);
    expect(parseItunesLookupResult(undefined)).toEqual(EMPTY_SONG_LOOKUP);
  });

  it("turns malformed fields into null", () => {
    expect(
      parseItunesLookupResult({
        primaryGenreName: "  ",
        releaseDate: "sometime",
        artistId: 0,
        collectionId: "abc",
        trackTimeMillis: -5,
      })
    ).toEqual(EMPTY_SONG_LOOKUP);
    expect(parseItunesLookupResult({ trackTimeMillis: Number.NaN }).durationMs).toBeNull();
    expect(parseItunesLookupResult({ trackTimeMillis: 3_000_000_000 }).durationMs).toBeNull();
  });

  it("accepts ids sent as numeric strings and rounds a fractional length", () => {
    const got = parseItunesLookupResult({ artistId: "42", collectionId: " 7 ", trackTimeMillis: 1000.6 });
    expect(got.artistId).toBe("42");
    expect(got.albumId).toBe("7");
    expect(got.durationMs).toBe(1001);
  });
});

describe("releaseDateToDate", () => {
  it("takes the date part of the store's timestamp", () => {
    expect(releaseDateToDate("1977-09-29T12:00:00Z")).toBe("1977-09-29");
    expect(releaseDateToDate("2011-01-01T08:00:00Z")).toBe("2011-01-01");
    expect(releaseDateToDate("1969-07-20")).toBe("1969-07-20");
  });

  it("rejects anything that isn't a real date", () => {
    expect(releaseDateToDate("2020-02-30T00:00:00Z")).toBeNull();
    expect(releaseDateToDate("1999")).toBeNull();
    expect(releaseDateToDate("")).toBeNull();
    expect(releaseDateToDate(19991231)).toBeNull();
    expect(releaseDateToDate(null)).toBeNull();
  });
});

describe("pickLookupResult", () => {
  it("prefers the track over an album wrapper", () => {
    const album = { wrapperType: "collection", collectionId: 9 };
    expect(pickLookupResult({ results: [album, lookupResult] })).toBe(lookupResult);
  });

  it("falls back to the first result, and to null when there are none", () => {
    const only = { collectionName: "X" };
    expect(pickLookupResult({ results: [only] })).toBe(only);
    expect(pickLookupResult({ results: [] })).toBeNull();
    expect(pickLookupResult({})).toBeNull();
    expect(pickLookupResult(null)).toBeNull();
  });
});

describe("songMetadataColumns", () => {
  it("names the moments columns", () => {
    expect(songMetadataColumns(parseItunesLookupResult(lookupResult))).toEqual({
      song_genre: "Rock",
      song_release_date: "1975-10-31",
      song_artist_id: "3296287",
      song_album_id: "1440806041",
      song_duration_ms: 354320,
    });
  });

  it("is all null for an empty lookup", () => {
    expect(Object.values(songMetadataColumns(EMPTY_SONG_LOOKUP)).every((v) => v === null)).toBe(true);
  });
});
