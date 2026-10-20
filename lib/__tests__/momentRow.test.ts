import { describe, it, expect } from "vitest";
import {
  momentRowFields,
  persistableArtworkUrl,
  songIdentityChanged,
  removedPaths,
  type MomentFieldsInput,
} from "../momentRow";
import type { Song } from "@/types";

const song: Song = {
  id: "1",
  title: "Lovely Day",
  artistName: "Bill Withers",
  albumName: "Menagerie",
  artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg",
  provider: "apple_music",
  appleMusicId: "1",
  spotifyId: null,
  durationMs: 1000,
};

const input = (over: Partial<MomentFieldsInput> = {}): MomentFieldsInput => ({
  song,
  reflection: "  sunny  ",
  moods: ["happy", "custom_1"],
  people: ["Sam"],
  locationResult: { name: "Denver", lat: 39.7, lng: -104.9 },
  momentDate: new Date(2026, 9, 5),
  ...over,
});

describe("momentRowFields", () => {
  it("maps the form to the moments columns", () => {
    expect(momentRowFields(input())).toEqual({
      song_title: "Lovely Day",
      song_artist: "Bill Withers",
      song_album_name: "Menagerie",
      song_artwork_url: song.artworkUrl,
      song_provider: "apple_music",
      song_apple_music_id: "1",
      song_spotify_id: null,
      reflection_text: "sunny",
      mood: "happy",
      moods: ["happy", "custom_1"],
      people: ["Sam"],
      location: "Denver",
      location_lat: 39.7,
      location_lng: -104.9,
      moment_date: "2026-10-05",
    });
  });

  it("clears the coordinates with the place, so the map can't pin a removed location", () => {
    const row = momentRowFields(input({ locationResult: null }));
    expect(row.location).toBeNull();
    expect(row.location_lat).toBeNull();
    expect(row.location_lng).toBeNull();
  });

  it("writes a place picked without coordinates as name only", () => {
    const row = momentRowFields(input({ locationResult: { name: "Paris", lat: null, lng: null } }));
    expect(row).toMatchObject({ location: "Paris", location_lat: null, location_lng: null });
  });

  it("falls back to the looked-up album name", () => {
    expect(momentRowFields(input({ song: { ...song, albumName: "" } }), "Looked Up").song_album_name).toBe(
      "Looked Up"
    );
  });

  it("never stores inline or local artwork", () => {
    const row = momentRowFields(input({ song: { ...song, artworkUrl: "data:image/png;base64,AAAA" } }));
    expect(row.song_artwork_url).toBeNull();
  });

  it("writes no mood when none is selected", () => {
    expect(momentRowFields(input({ moods: [] }))).toMatchObject({ mood: null, moods: [] });
  });
});

describe("persistableArtworkUrl", () => {
  it("keeps remote URLs only", () => {
    expect(persistableArtworkUrl("https://i.scdn.co/image/abc")).toBe("https://i.scdn.co/image/abc");
    expect(persistableArtworkUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(persistableArtworkUrl("file:///tmp/a.png")).toBeNull();
    expect(persistableArtworkUrl("")).toBeNull();
    expect(persistableArtworkUrl(null)).toBeNull();
  });
});

describe("songIdentityChanged", () => {
  it("is false for the same song, whatever else differs", () => {
    const restyled: Song = { ...song, artworkUrl: "", albumName: "" };
    expect(songIdentityChanged(song, restyled)).toBe(false);
  });

  it("is true for a different recording", () => {
    expect(songIdentityChanged(song, { ...song, appleMusicId: "2" })).toBe(true);
    expect(songIdentityChanged(song, { ...song, title: "Other" })).toBe(true);
    expect(songIdentityChanged(song, { ...song, provider: "spotify", spotifyId: "s1" })).toBe(true);
  });

  it("treats a missing and a null id alike", () => {
    expect(
      songIdentityChanged({ ...song, spotifyId: null }, { ...song, spotifyId: undefined as unknown as null })
    ).toBe(false);
  });
});

describe("removedPaths", () => {
  it("lists what is no longer referenced", () => {
    expect(removedPaths(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    expect(removedPaths(["a"], ["a", "new"])).toEqual([]);
  });
});
