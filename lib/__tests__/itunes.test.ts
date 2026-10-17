/**
 * Spotify moments borrow their 30-second preview from the matching iTunes
 * track. A wrong match plays the wrong song under someone's memory, which is
 * worse than silence, so matching is strict and these tests pin that.
 */
import { describe, it, expect } from "vitest";
import { normalizeTitle, versionKey, pickItunesMatch, itunesTrackToSong, type ItunesTrack } from "../itunes";

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

describe("versionKey", () => {
  it("is empty for the original recording, remasters and features", () => {
    expect(versionKey("Electric Feel")).toBe("");
    expect(versionKey("Bohemian Rhapsody - Remastered 2011")).toBe("");
    expect(versionKey("Lovely Day (feat. Someone)")).toBe("");
  });

  it("reads remix, live and edit markers in parens, brackets or after a dash", () => {
    expect(versionKey("Electric Feel (Justice Remix)")).toBe("justice remix");
    expect(versionKey("Electric Feel - Justice Remix")).toBe("justice remix");
    expect(versionKey("Don't Stop Me Now [Live]")).toBe("live");
    expect(versionKey("Song - Radio Edit")).toBe("radio edit");
  });
});

describe("pickItunesMatch versions", () => {
  const original = track({ trackId: 1, trackName: "Electric Feel", artistName: "MGMT" });
  const justice = track({ trackId: 2, trackName: "Electric Feel (Justice Remix)", artistName: "MGMT" });

  it("never gives the original a remix's preview", () => {
    expect(pickItunesMatch([justice], "Electric Feel", "MGMT")).toBeNull();
    expect(pickItunesMatch([justice, original], "Electric Feel", "MGMT")?.trackId).toBe(1);
  });

  it("gives a picked remix the remix's preview, not the original's", () => {
    expect(pickItunesMatch([original, justice], "Electric Feel - Justice Remix", "MGMT")?.trackId).toBe(2);
    expect(pickItunesMatch([original], "Electric Feel (Justice Remix)", "MGMT")).toBeNull();
  });
});
