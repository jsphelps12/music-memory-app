/**
 * `mapRowToMoment` is the single DB→TypeScript mapping for moments, and
 * `MOMENT_CARD_COLUMNS` is the column list every moment *list* query uses.
 * They are tested together because the interesting behaviour is the gap between
 * them: the card column list is a strict subset of what the mapper reads, and
 * the mapper defaults everything it doesn't find. The result type-checks as a
 * complete `Moment` while several of its fields are fabricated.
 *
 * Neither module imports anything at runtime beyond `@/types`, so no mocks.
 */
import { describe, it, expect } from "vitest";
import { mapRowToMoment } from "../moments";
import { MOMENT_CARD_COLUMNS } from "../momentColumns";
import type { Moment } from "@/types";

/** A row with every column the `moments` table exposes to the app. */
function fullRow() {
  return {
    id: "m1",
    user_id: "u1",
    song_title: "Bohemian Rhapsody",
    song_artist: "Queen",
    song_album_name: "A Night at the Opera",
    song_artwork_url: "https://example.com/art.jpg",
    song_provider: "spotify",
    song_apple_music_id: "1440806523",
    song_spotify_id: "3z8h0TU7ReDPLIbEnYhWZb",
    song_preview_url: "https://example.com/preview.m4a",
    reflection_text: "Driving home at 2am.",
    photo_urls: ["u1/a.jpg"],
    photo_thumbnails: ["u1/thumb_a.jpg"],
    mood: "nostalgic",
    moods: ["nostalgic", "energetic"],
    people: ["Sam"],
    location: "Provo, UT",
    location_lat: 40.2338,
    location_lng: -111.6585,
    moment_date: "2019-08-14",
    time_of_day: "night",
    weather_temp_f: 71,
    weather_condition: "clear",
    created_at: "2019-08-15T04:02:00Z",
    updated_at: "2019-08-15T04:02:00Z",
    visibility: "connections",
    share_token: "tok_123",
    guest_uuid: "guest-1",
  };
}

describe("mapRowToMoment", () => {
  it("maps every snake_case column to its camelCase field", () => {
    expect(mapRowToMoment(fullRow())).toEqual({
      id: "m1",
      userId: "u1",
      songTitle: "Bohemian Rhapsody",
      songArtist: "Queen",
      songAlbumName: "A Night at the Opera",
      songArtworkUrl: "https://example.com/art.jpg",
      songProvider: "spotify",
      songAppleMusicId: "1440806523",
      songSpotifyId: "3z8h0TU7ReDPLIbEnYhWZb",
      songPreviewUrl: "https://example.com/preview.m4a",
      reflectionText: "Driving home at 2am.",
      photoUrls: ["u1/a.jpg"],
      photoThumbnails: ["u1/thumb_a.jpg"],
      moods: ["nostalgic", "energetic"],
      people: ["Sam"],
      location: "Provo, UT",
      locationLat: 40.2338,
      locationLng: -111.6585,
      momentDate: "2019-08-14",
      timeOfDay: "night",
      weatherTempF: 71,
      weatherCondition: "clear",
      createdAt: "2019-08-15T04:02:00Z",
      updatedAt: "2019-08-15T04:02:00Z",
      visibility: "connections",
      shareToken: "tok_123",
      guestUuid: "guest-1",
    });
  });

  it("defaults song_provider to apple_music for rows predating the Spotify column", () => {
    expect(mapRowToMoment({ id: "m1", song_provider: null }).songProvider).toBe("apple_music");
    expect(mapRowToMoment({ id: "m1" }).songProvider).toBe("apple_music");
  });

  it("defaults array columns to [] rather than leaving them undefined", () => {
    // Every consumer does `.map()` / `.length` on these without a guard
    // (MomentCard reads photoThumbnails.length directly), so undefined here is
    // a crash, not a missing value.
    const m = mapRowToMoment({ id: "m1", photo_urls: null, photo_thumbnails: null, people: null });
    expect(m.photoUrls).toEqual([]);
    expect(m.photoThumbnails).toEqual([]);
    expect(m.people).toEqual([]);
  });

  it("normalises absent nullable columns to null, not undefined", () => {
    const m = mapRowToMoment({ id: "m1" });
    expect(m.songAppleMusicId).toBeNull();
    expect(m.songSpotifyId).toBeNull();
    expect(m.songPreviewUrl).toBeNull();
    expect(m.locationLat).toBeNull();
    expect(m.locationLng).toBeNull();
    expect(m.timeOfDay).toBeNull();
    expect(m.weatherTempF).toBeNull();
    expect(m.weatherCondition).toBeNull();
    expect(m.shareToken).toBeNull();
    expect(m.guestUuid).toBeNull();
  });

  it("dual-reads moods, falling back to the legacy single mood column", () => {
    // Rows written by binaries <= build 22 have only `mood`; rows written by
    // multi-mood clients have both (mood = first). moods wins when present.
    expect(mapRowToMoment({ id: "m1", mood: "nostalgic" }).moods).toEqual(["nostalgic"]);
    expect(mapRowToMoment({ id: "m1", mood: null }).moods).toEqual([]);
    expect(
      mapRowToMoment({ id: "m1", mood: "nostalgic", moods: ["nostalgic", "joyful"] }).moods
    ).toEqual(["nostalgic", "joyful"]);
    // An empty moods array is a real value (moods cleared), not an absence.
    expect(mapRowToMoment({ id: "m1", mood: "nostalgic", moods: [] }).moods).toEqual([]);
  });

  it("defaults visibility to private, the safe direction", () => {
    expect(mapRowToMoment({ id: "m1" }).visibility).toBe("private");
    expect(mapRowToMoment({ id: "m1", visibility: "link" }).visibility).toBe("link");
  });

  it("preserves falsy-but-meaningful values instead of defaulting them", () => {
    // `?? ` not `|| ` — 0°F and an empty share token are real values.
    const m = mapRowToMoment({ id: "m1", weather_temp_f: 0, location_lat: 0, location_lng: 0 });
    expect(m.weatherTempF).toBe(0);
    expect(m.locationLat).toBe(0);
    expect(m.locationLng).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Contract: MOMENT_CARD_COLUMNS vs the Moment type
// ---------------------------------------------------------------------------

function parseColumns(list: string): string[] {
  return list
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Moment fields that a card-column row genuinely populates.
 */
const CARD_BACKED_FIELDS = [
  "id",
  // user_id added 2026-07-31: MomentCard's long-press edit/delete gates on
  // `item.userId === user.id`, which silently disabled itself when card rows
  // had no owner.
  "userId",
  "momentDate",
  "createdAt",
  "songTitle",
  "songArtist",
  "songAlbumName",
  "songArtworkUrl",
  "songProvider",
  "songAppleMusicId",
  "songSpotifyId",
  "songPreviewUrl",
  "moods",
  "photoUrls",
  "photoThumbnails",
  "reflectionText",
  "guestUuid",
] as const;

/**
 * Moment fields that a card-column row does NOT populate — `mapRowToMoment`
 * invents them. This is the trapdoor: the return type says `Moment`, so nothing
 * stops a screen from reading `moment.userId` (undefined) or trusting
 * `moment.visibility === "private"` (a default, not the stored value) on an
 * object that came off the timeline.
 */
const CARD_FABRICATED_FIELDS = [
  "people",
  "location",
  "locationLat",
  "locationLng",
  "timeOfDay",
  "weatherTempF",
  "weatherCondition",
  "updatedAt",
  "visibility",
  "shareToken",
] as const;

describe("MOMENT_CARD_COLUMNS contract", () => {
  it("selects exactly the columns it is expected to", () => {
    // Pinned deliberately. Adding a column here changes the payload size of the
    // single most-executed query in the app; removing one silently blanks a
    // field on every card. Either way it should be a conscious edit.
    expect(parseColumns(MOMENT_CARD_COLUMNS).sort()).toEqual(
      [
        "created_at",
        "guest_name",
        "guest_uuid",
        "id",
        "user_id",
        "mood",
        "moods",
        "moment_date",
        "photo_thumbnails",
        "photo_urls",
        "reflection_text",
        "song_album_name",
        "song_apple_music_id",
        "song_artist",
        "song_artwork_url",
        "song_preview_url",
        "song_provider",
        "song_spotify_id",
        "song_title",
      ].sort()
    );
  });

  it("has no duplicate columns", () => {
    const cols = parseColumns(MOMENT_CARD_COLUMNS);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it("maps guest_name into contributorName for guest rows", () => {
    // guest_name is only meaningful alongside guest_uuid (both set by the
    // guest-contribution edge function). Mapping it here means every fetch
    // path — including the moment-detail plain select, which has no RPC to
    // supply contributorName — attributes guest moments correctly.
    expect(parseColumns(MOMENT_CARD_COLUMNS)).toContain("guest_name");
    const guest = mapRowToMoment({ id: "m1", guest_uuid: "g1", guest_name: "Aunt Carol" });
    expect(guest.contributorName).toBe("Aunt Carol");
    // A guest_name without guest_uuid is not a guest row — don't attribute.
    const own = mapRowToMoment({ id: "m2", guest_name: "Aunt Carol" });
    expect(own.contributorName).toBeUndefined();
  });

  it("populates every card-backed field from a card-column row", () => {
    const full = fullRow();
    const cardRow: Record<string, unknown> = {};
    for (const col of parseColumns(MOMENT_CARD_COLUMNS)) {
      cardRow[col] = (full as Record<string, unknown>)[col];
    }

    const moment = mapRowToMoment(cardRow);
    const complete = mapRowToMoment(full);

    for (const field of CARD_BACKED_FIELDS) {
      expect(moment[field], `${field} should survive the card column list`).toEqual(
        complete[field]
      );
    }
  });

  it("fabricates the fields the card column list omits", () => {
    const full = fullRow();
    const cardRow: Record<string, unknown> = {};
    for (const col of parseColumns(MOMENT_CARD_COLUMNS)) {
      cardRow[col] = (full as Record<string, unknown>)[col];
    }

    const moment = mapRowToMoment(cardRow);
    const complete = mapRowToMoment(full);

    // Typed as a complete Moment, but: no people, and it claims to be
    // private when the stored row says "connections".
    expect(moment.people).toEqual([]);
    expect(moment.visibility).toBe("private");
    expect(moment.shareToken).toBeNull();
    expect(moment.location).toBeUndefined();
    expect(moment.updatedAt).toBeUndefined();

    for (const field of CARD_FABRICATED_FIELDS) {
      expect(
        moment[field],
        `${field} is not in MOMENT_CARD_COLUMNS but matched the stored row — ` +
          `move it to CARD_BACKED_FIELDS if the column was added`
      ).not.toEqual(complete[field]);
    }
  });

  it("classifies every field mapRowToMoment produces as backed or fabricated", () => {
    // The loud-failure mechanism. Add a field to mapRowToMoment (or to the
    // Moment type, and then to the mapper) and this fails until you decide
    // whether MOMENT_CARD_COLUMNS covers it — which is exactly the decision
    // that gets skipped, producing another silently-defaulted field on every
    // card-derived Moment.
    const produced = Object.keys(mapRowToMoment(fullRow())).sort();
    const classified = [...CARD_BACKED_FIELDS, ...CARD_FABRICATED_FIELDS].sort();

    expect(produced).toEqual(classified);
  });

  it("keeps the classification lists disjoint", () => {
    const backed = new Set<string>(CARD_BACKED_FIELDS);
    for (const field of CARD_FABRICATED_FIELDS) {
      expect(backed.has(field), `${field} is in both lists`).toBe(false);
    }
  });
});

describe("Moment type coverage", () => {
  it("declares no Moment field that mapRowToMoment silently forgets", () => {
    // `contributorName` is the one intentional exception: it is not a column on
    // `moments`. The shared-album fetch path stitches it on, and mapRowToMoment
    // itself derives it from guest_name — but only for guest rows (fullRow has
    // guest_uuid without guest_name, so it stays absent here).
    const produced = new Set(Object.keys(mapRowToMoment(fullRow())));
    const expectedOptionalExtras: (keyof Moment)[] = ["contributorName"];

    for (const field of expectedOptionalExtras) {
      expect(produced.has(field)).toBe(false);
    }
  });
});
