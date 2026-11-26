/**
 * "Your day (Apple)": a picked Journaling Suggestion into capture's params.
 * The song is the first Apple Music one (another app's only without one),
 * matched to the catalog; photos, place, people and the date ride along; an
 * empty or partial suggestion still opens capture with what it has.
 */
import { describe, it, expect, vi } from "vitest";
import type { Song } from "@/types";
import {
  MAX_PEOPLE,
  MAX_PHOTOS,
  matchSuggestionSong,
  peopleFromParams,
  placeFromParams,
  placeName,
  resolveSuggestionSong,
  suggestionDate,
  suggestionPeople,
  suggestionPhotos,
  suggestionPlace,
  suggestionSong,
  yourDayCaptureParams,
  yourDayEventProps,
  type RawSuggestion,
  type WantedSong,
} from "../yourDay";

const NOW = Date.parse("2026-11-24T20:00:00Z");

function song(id: string, title: string, artistName: string): Song {
  return {
    id,
    title,
    artistName,
    albumName: "Album",
    artworkUrl: `https://is1-ssl.mzstatic.com/${id}/600x600bb.jpg`,
    provider: "apple_music",
    appleMusicId: id,
    spotifyId: null,
    durationMs: 200_000,
  };
}

const want = (title: string, artist = "", kind: "song" | "media" = "song"): WantedSong => ({ title, artist, album: "", kind });

describe("suggestionSong", () => {
  it("takes the first Apple Music song", () => {
    const s: RawSuggestion = {
      songs: [
        { title: "Electric Feel", artist: "MGMT", kind: "song" },
        { title: "Kids", artist: "MGMT", kind: "song" },
      ],
    };
    expect(suggestionSong(s)).toEqual({ title: "Electric Feel", artist: "MGMT", album: "", kind: "song" });
  });

  it("prefers an Apple Music song over another app's media listed first", () => {
    const s: RawSuggestion = {
      songs: [
        { title: "From Spotify", artist: "A", kind: "media" },
        { title: "From Apple Music", artist: "B", kind: "song" },
      ],
    };
    expect(suggestionSong(s)?.title).toBe("From Apple Music");
  });

  it("falls back to another app's media, and treats a missing kind as a song", () => {
    expect(suggestionSong({ songs: [{ title: "Only media", kind: "media" }] })?.kind).toBe("media");
    expect(suggestionSong({ songs: [{ title: "  No kind  " }] })).toEqual({ title: "No kind", artist: "", album: "", kind: "song" });
  });

  it("is null with no songs, or only untitled ones", () => {
    expect(suggestionSong({})).toBeNull();
    expect(suggestionSong({ songs: [] })).toBeNull();
    expect(suggestionSong({ songs: [{ title: "   " }] })).toBeNull();
  });
});

describe("matchSuggestionSong", () => {
  const original = song("1", "Electric Feel", "MGMT");
  const remix = song("2", "Electric Feel (Justice Remix)", "MGMT");
  const cover = song("3", "Electric Feel", "Some Cover Band");

  it("takes the same recording by the same artist", () => {
    expect(matchSuggestionSong(want("Electric Feel", "MGMT"), [cover, remix, original])).toEqual({
      song: original,
      candidates: [],
      how: "exact",
    });
  });

  it("keeps the version apart: a remix suggestion finds the remix", () => {
    expect(matchSuggestionSong(want("Electric Feel (Justice Remix)", "MGMT"), [original, remix]).song).toBe(remix);
  });

  it("ignores case, accents, punctuation and feat. credits; any one of several artists counts", () => {
    const feat = song("4", "Señorita (feat. Someone)", "Artist & Other");
    expect(matchSuggestionSong(want("senorita!", "Artist"), [feat]).how).toBe("exact");
    expect(matchSuggestionSong(want("Señorita", "Other"), [feat]).how).toBe("exact");
  });

  it("offers choices when nothing is the same recording, the artist's own first", () => {
    const got = matchSuggestionSong(want("Electric Feel (Live)", "MGMT"), [cover, original]);
    expect(got.how).toBe("close");
    expect(got.song).toBe(original);
    expect(got.candidates).toEqual([original, cover]);
  });

  it("fills in a single close result without asking", () => {
    const got = matchSuggestionSong(want("Electric Feel", "Someone Else"), [cover]);
    expect(got).toEqual({ song: cover, candidates: [], how: "close" });
  });

  it("keeps the suggestion's own song when the catalog has nothing like it", () => {
    const got = matchSuggestionSong({ title: "Unreleased", artist: "Me", album: "Demos", kind: "song" }, [cover]);
    expect(got.how).toBe("none");
    expect(got.song).toMatchObject({ id: "", title: "Unreleased", artistName: "Me", albumName: "Demos", appleMusicId: null });
  });

  it("leaves another app's media out when unmatched (it may be a podcast)", () => {
    expect(matchSuggestionSong(want("Episode 12", "A Show", "media"), [])).toEqual({ song: null, candidates: [], how: "none" });
  });
});

describe("resolveSuggestionSong", () => {
  const exact = song("1", "Kids", "MGMT");
  const other = song("2", "Kids", "Another Band");

  it("searches title and first artist in every catalog at once", async () => {
    const appleMusic = vi.fn(async () => [exact]);
    const itunes = vi.fn(async () => [other]);
    const got = await resolveSuggestionSong(want("Kids", "MGMT, Someone"), [appleMusic, itunes]);
    expect(appleMusic).toHaveBeenCalledWith("Kids MGMT");
    expect(itunes).toHaveBeenCalledWith("Kids MGMT");
    expect(got.song).toBe(exact);
  });

  it("prefers an exact Apple Music match over an exact iTunes one that came back first", async () => {
    vi.useFakeTimers();
    const itunesExact = song("3", "Kids", "MGMT");
    const pending = resolveSuggestionSong(want("Kids", "MGMT"), [
      () => new Promise<Song[]>((r) => setTimeout(() => r([exact]), 500)),
      async () => [itunesExact],
    ]);
    await vi.advanceTimersByTimeAsync(500);
    const got = await pending;
    vi.useRealTimers();
    expect(got.song).toBe(exact);
  });

  it("returns an exact Apple Music match without waiting for iTunes", async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = resolveSuggestionSong(want("Kids", "MGMT"), [async () => [exact], () => new Promise<Song[]>(() => {})], 6000).then(
      (m) => {
        settled = true;
        return m;
      }
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    vi.useRealTimers();
    expect((await pending).how).toBe("exact");
  });

  it("takes no longer than one timeout with both searches hanging", async () => {
    vi.useFakeTimers();
    const hang = () => new Promise<Song[]>(() => {});
    const pending = resolveSuggestionSong(want("Kids", "MGMT"), [hang, hang], 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const got = await pending;
    vi.useRealTimers();
    expect(got.how).toBe("none");
  });

  it("falls through a failing search to the next", async () => {
    const got = await resolveSuggestionSong(want("Kids", "MGMT"), [
      async () => {
        throw new Error("not authorized");
      },
      async () => [exact],
    ]);
    expect(got.how).toBe("exact");
  });

  it("keeps a close match from an earlier search over nothing from a later one", async () => {
    const got = await resolveSuggestionSong(want("Kids", "MGMT"), [async () => [other], async () => []]);
    expect(got).toMatchObject({ song: other, how: "close" });
  });

  it("gives up on a search that hangs", async () => {
    vi.useFakeTimers();
    const pending = resolveSuggestionSong(want("Kids", "MGMT"), [() => new Promise<Song[]>(() => {})], 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const got = await pending;
    vi.useRealTimers();
    expect(got.how).toBe("none");
  });
});

describe("place, people, photos, date", () => {
  it("names a place with its city, once", () => {
    expect(placeName({ place: "Blue Bottle", city: "Oakland" })).toBe("Blue Bottle, Oakland");
    expect(placeName({ place: "Oakland Coliseum", city: "Oakland" })).toBe("Oakland Coliseum");
    expect(placeName({ city: "Oakland" })).toBe("Oakland");
    expect(placeName({})).toBeNull();
  });

  it("takes the first named place, with coordinates only when valid", () => {
    expect(
      suggestionPlace({ places: [{ lat: 1, lng: 2 }, { place: "Park", lat: 37.8, lng: -122.2 }, { place: "Later" }] })
    ).toEqual({ name: "Park", lat: 37.8, lng: -122.2 });
    expect(suggestionPlace({ places: [{ place: "Nowhere", lat: 200, lng: 0 }] })).toEqual({ name: "Nowhere", lat: null, lng: null });
    expect(suggestionPlace({})).toBeNull();
  });

  it("trims and de-duplicates names, up to the cap", () => {
    expect(suggestionPeople({ people: [" Sam ", "sam", "", "Alex"] })).toEqual(["Sam", "Alex"]);
    const many = Array.from({ length: 30 }, (_, i) => `Person ${i}`);
    expect(suggestionPeople({ people: many })).toHaveLength(MAX_PEOPLE);
  });

  it("keeps only file copies, in order, up to the cap", () => {
    const photos = Array.from({ length: 14 }, (_, i) => ({ uri: `file:///caches/journaling-suggestions/x/${i}.jpg` }));
    expect(suggestionPhotos({ photos })).toHaveLength(MAX_PHOTOS);
    expect(suggestionPhotos({ photos: [{ uri: "https://example.com/a.jpg" }, { uri: "file:///a.jpg" }, { uri: "file:///a.jpg" }] })).toEqual([
      "file:///a.jpg",
    ]);
  });

  it("dates it when the suggestion starts, else its earliest item, never in the future", () => {
    expect(suggestionDate({ date: "2026-11-23T09:00:00Z" }, NOW)).toBe(Date.parse("2026-11-23T09:00:00Z"));
    expect(
      suggestionDate({ songs: [{ title: "a", date: "2026-11-23T12:00:00Z" }], photos: [{ uri: "file:///p", date: "2026-11-23T08:00:00Z" }] }, NOW)
    ).toBe(Date.parse("2026-11-23T08:00:00Z"));
    expect(suggestionDate({ date: "2027-01-01T00:00:00Z" }, NOW)).toBeNull();
    expect(suggestionDate({ date: "not a date" }, NOW)).toBeNull();
    expect(suggestionDate({}, NOW)).toBeNull();
  });
});

describe("yourDayCaptureParams", () => {
  const full: RawSuggestion = {
    title: "Evening at the park",
    date: "2026-11-23T18:00:00Z",
    songs: [{ title: "Kids", artist: "MGMT", kind: "song" }],
    photos: [{ uri: "file:///c/0.jpg" }, { uri: "file:///c/1.heic" }],
    places: [{ place: "Lake Merritt", city: "Oakland", lat: 37.8, lng: -122.25 }],
    people: ["Sam", "Alex"],
    skipped: 1,
  };

  it("fills everything a full suggestion carries", () => {
    const kids = song("9", "Kids", "MGMT");
    expect(yourDayCaptureParams(full, { song: kids, candidates: [], how: "exact" }, NOW)).toEqual({
      source: "your_day",
      songId: "9",
      songTitle: "Kids",
      songArtist: "MGMT",
      songAlbum: "Album",
      songArtwork: kids.artworkUrl,
      songProvider: "apple_music",
      songAppleMusicId: "9",
      songSpotifyId: "",
      songDurationMs: "200000",
      sharedPhotoPaths: JSON.stringify(["file:///c/0.jpg", "file:///c/1.heic"]),
      momentAt: String(Date.parse("2026-11-23T18:00:00Z")),
      placeName: "Lake Merritt, Oakland",
      placeLat: "37.8",
      placeLng: "-122.25",
      peopleNames: JSON.stringify(["Sam", "Alex"]),
    });
  });

  it("passes the choices along when the match wasn't certain", () => {
    const a = song("1", "Kids", "MGMT");
    const b = song("2", "Kids", "Cover");
    const params = yourDayCaptureParams(full, { song: a, candidates: [a, b], how: "close" }, NOW);
    expect(JSON.parse(params.shareCandidates)).toEqual([a, b]);
  });

  it("opens capture with the rest and no song when there's no song", () => {
    const params = yourDayCaptureParams({ ...full, songs: [] }, null, NOW);
    expect(params.songTitle).toBeUndefined();
    expect(params.sharedPhotoPaths).toBeDefined();
    expect(params.placeName).toBe("Lake Merritt, Oakland");
  });

  it("an empty suggestion still opens capture, marked your_day", () => {
    expect(yourDayCaptureParams({}, null, NOW)).toEqual({ source: "your_day" });
  });

  it("a place without coordinates keeps just the name", () => {
    const params = yourDayCaptureParams({ places: [{ city: "Oakland" }] }, null, NOW);
    expect(params).toEqual({ source: "your_day", placeName: "Oakland" });
  });
});

describe("back out of the params in capture", () => {
  it("reads the place", () => {
    expect(placeFromParams({ placeName: "Park", placeLat: "37.8", placeLng: "-122.2" })).toEqual({ name: "Park", lat: 37.8, lng: -122.2 });
    expect(placeFromParams({ placeName: "Park" })).toEqual({ name: "Park", lat: null, lng: null });
    expect(placeFromParams({})).toBeNull();
  });

  it("reads people, ignoring anything malformed", () => {
    expect(peopleFromParams(JSON.stringify(["Sam", 3, "Alex"]))).toEqual(["Sam", "Alex"]);
    expect(peopleFromParams("{")).toEqual([]);
    expect(peopleFromParams(undefined)).toEqual([]);
  });
});

describe("yourDayEventProps", () => {
  it("carries counts and flags, never titles, names or places", () => {
    const s: RawSuggestion = {
      songs: [{ title: "Secret Song", artist: "Secret Artist" }],
      photos: [{ uri: "file:///a.jpg" }],
      places: [{ place: "Home Street" }],
      people: ["Private Person"],
    };
    const props = yourDayEventProps(s, { song: null, candidates: [], how: "none" });
    expect(props).toEqual({
      songs: 1,
      song_kind: "song",
      song_match: "none",
      photos: 1,
      has_place: true,
      people: 1,
      has_date: false,
      skipped: 0,
    });
    expect(JSON.stringify(props)).not.toMatch(/Secret|Private|Home/);
  });
});
