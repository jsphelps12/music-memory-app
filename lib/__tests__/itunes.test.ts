/**
 * Spotify moments borrow their 30-second preview from the matching iTunes
 * track. A wrong match plays the wrong song under someone's memory, which is
 * worse than silence, so matching is strict and these tests pin that.
 */
import { describe, it, expect } from "vitest";
import { normalizeTitle, pickItunesMatch, itunesTrackToSong, type ItunesTrack } from "../itunes";

const track = (over: Partial<ItunesTrack>): ItunesTrack => ({
  trackId: 1,
  trackName: "Bohemian Rhapsody",
  artistName: "Queen",
  previewUrl: "https://audio/preview.m4a",
  ...over,
});

describe("normalizeTitle", () => {
  it("ignores case, punctuation and edition suffixes", () => {
    expect(normalizeTitle("Bohemian Rhapsody - Remastered 2011")).toBe("bohemian rhapsody");
    expect(normalizeTitle("Lovely Day (feat. Someone)")).toBe("lovely day");
    expect(normalizeTitle("Don't Stop Me Now [Live]")).toBe("dont stop me now");
  });
});

describe("pickItunesMatch", () => {
  it("matches the same title by the same artist", () => {
    const got = pickItunesMatch([track({})], "Bohemian Rhapsody - Remastered 2011", "Queen");
    expect(got?.trackId).toBe(1);
  });

  it("rejects a same-titled song by someone else (a cover is not a preview)", () => {
    const cover = track({ trackId: 2, artistName: "Panic! At the Disco" });
    expect(pickItunesMatch([cover], "Bohemian Rhapsody", "Queen")).toBeNull();
  });

  it("prefers the real recording when a cover is listed first", () => {
    const cover = track({ trackId: 2, artistName: "Panic! At the Disco" });
    const real = track({ trackId: 3 });
    expect(pickItunesMatch([cover, real], "Bohemian Rhapsody", "Queen")?.trackId).toBe(3);
  });

  it("accepts any one of Spotify's comma-joined artists", () => {
    const t = track({ trackName: "Under Pressure", artistName: "David Bowie" });
    expect(pickItunesMatch([t], "Under Pressure", "Queen, David Bowie")?.trackName).toBe("Under Pressure");
  });

  it("rejects a different song by the same artist", () => {
    expect(pickItunesMatch([track({ trackName: "Somebody to Love" })], "Bohemian Rhapsody", "Queen")).toBeNull();
  });

  it("returns null for empty input rather than guessing", () => {
    expect(pickItunesMatch([], "Bohemian Rhapsody", "Queen")).toBeNull();
    expect(pickItunesMatch([track({})], "", "Queen")).toBeNull();
    expect(pickItunesMatch([track({ trackId: undefined })], "Bohemian Rhapsody", "Queen")).toBeNull();
  });
});

describe("itunesTrackToSong", () => {
  it("maps to an Apple Music song with a large artwork URL", () => {
    const song = itunesTrackToSong(track({ trackId: 42, artworkUrl100: "https://a/100x100bb.jpg" }));
    expect(song).toMatchObject({ id: "42", appleMusicId: "42", provider: "apple_music", spotifyId: null });
    expect(song.artworkUrl).toBe("https://a/600x600bb.jpg");
  });
});
