import { describe, expect, it } from "vitest";
import {
  backgroundMomentRow,
  CAPTURE_KEY_PATTERN,
  captureKeyFromHeader,
  cleanAppleMusicId,
  cleanDeviceId,
  cleanDeviceLabel,
  EMPTY_SONG_LOOKUP,
  LIMITS,
  localDateAndTimeOfDay,
  newCaptureKey,
  keyIsLive,
  parseQuickCaptureBody,
  sha256Hex,
  songLookupFromResponse,
} from "./quickCapture";
import { parseItunesLookupResult, pickLookupResult } from "../../../lib/songMetadata";

const NOW = Date.parse("2026-11-25T18:30:00Z");
const valid = {
  appleMusicId: "1440831203",
  title: "Holocene",
  artist: "Bon Iver",
  album: "Bon Iver",
  capturedAt: "2026-11-25T18:29:58Z",
  utcOffsetMinutes: -420,
};

describe("capture keys", () => {
  it("makes a fresh 256-bit key every time, in the expected shape", () => {
    const a = newCaptureKey();
    const b = newCaptureKey();
    expect(a).toMatch(CAPTURE_KEY_PATTERN);
    expect(a).not.toBe(b);
  });

  it("hashes to sha256 hex", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("only accepts `Capture <key>` with a well-formed key", () => {
    const key = newCaptureKey();
    expect(captureKeyFromHeader(`Capture ${key}`)).toBe(key);
    expect(captureKeyFromHeader(`Bearer ${key}`)).toBeNull();
    expect(captureKeyFromHeader("Capture stc_short")).toBeNull();
    expect(captureKeyFromHeader(`Capture ${key} extra`)).toBeNull();
    expect(captureKeyFromHeader("Bearer eyJhbGciOiJIUzI1NiJ9.e30.x")).toBeNull();
    expect(captureKeyFromHeader(null)).toBeNull();
  });

  it("cleans the install id and label", () => {
    expect(cleanDeviceId("A1b2C3d4-e5_f")).toBe("A1b2C3d4-e5_f");
    expect(cleanDeviceId("short")).toBeNull();
    expect(cleanDeviceId("has space in it")).toBeNull();
    expect(cleanDeviceId(42)).toBeNull();
    expect(cleanDeviceLabel("  Josh's\n  iPhone ")).toBe("Josh's iPhone");
    expect(cleanDeviceLabel("x".repeat(200))).toHaveLength(LIMITS.deviceLabelMax);
    expect(cleanDeviceLabel("   ")).toBeNull();
    expect(cleanDeviceLabel({})).toBeNull();
  });
});

describe("keyIsLive", () => {
  const created = (daysAgo: number) => new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  it("accepts a key under 90 days old and refuses older or revoked ones", () => {
    expect(keyIsLive({ created_at: created(1), revoked_at: null }, NOW)).toBe(true);
    expect(keyIsLive({ created_at: created(89), revoked_at: null }, NOW)).toBe(true);
    expect(keyIsLive({ created_at: created(91), revoked_at: null }, NOW)).toBe(false);
    expect(keyIsLive({ created_at: created(1), revoked_at: created(0) }, NOW)).toBe(false);
    expect(keyIsLive({ created_at: "garbage", revoked_at: null }, NOW)).toBe(false);
  });
});

describe("parseQuickCaptureBody", () => {
  it("accepts what the intent sends", () => {
    const r = parseQuickCaptureBody(valid, NOW);
    expect(r).toEqual({
      ok: true,
      value: {
        appleMusicId: "1440831203",
        title: "Holocene",
        artist: "Bon Iver",
        album: "Bon Iver",
        artworkUrl: null,
        capturedAtMs: Date.parse(valid.capturedAt),
        utcOffsetMinutes: -420,
      },
    });
  });

  it("treats a song outside the catalog (store id 0 or empty) as having no id", () => {
    for (const appleMusicId of ["0", "", 0, null, undefined]) {
      const r = parseQuickCaptureBody({ ...valid, appleMusicId }, NOW);
      expect(r.ok && r.value.appleMusicId).toBeNull();
    }
  });

  it("refuses wrong types instead of coercing them", () => {
    const bad: Record<string, unknown>[] = [
      { title: 5 },
      { title: "   " },
      { artist: undefined },
      { album: 7 },
      { appleMusicId: "12ab" },
      { appleMusicId: { id: 1 } },
      { artworkUrl: "http://example.com/a.jpg" },
      { artworkUrl: "javascript:alert(1)" },
      { capturedAt: 1764095398000 },
      { capturedAt: "yesterday" },
      { capturedAt: "2026-11-25" },
      { utcOffsetMinutes: 30.5 },
      { utcOffsetMinutes: 2000 },
      { utcOffsetMinutes: "-420" },
    ];
    for (const patch of bad) {
      expect(parseQuickCaptureBody({ ...valid, ...patch }, NOW).ok, JSON.stringify(patch)).toBe(false);
    }
    expect(parseQuickCaptureBody(null, NOW).ok).toBe(false);
    expect(parseQuickCaptureBody([valid], NOW).ok).toBe(false);
  });

  it("caps text lengths", () => {
    expect(parseQuickCaptureBody({ ...valid, title: "x".repeat(LIMITS.titleMax) }, NOW).ok).toBe(true);
    expect(parseQuickCaptureBody({ ...valid, title: "x".repeat(LIMITS.titleMax + 1) }, NOW).ok).toBe(false);
    expect(parseQuickCaptureBody({ ...valid, artist: "x".repeat(LIMITS.artistMax + 1) }, NOW).ok).toBe(false);
  });

  it("only takes a capture time near the server's clock", () => {
    const at = (ms: number) => ({ ...valid, capturedAt: new Date(ms).toISOString() });
    expect(parseQuickCaptureBody(at(NOW - LIMITS.capturedAtMaxAgeMs + 1000), NOW).ok).toBe(true);
    expect(parseQuickCaptureBody(at(NOW - LIMITS.capturedAtMaxAgeMs - 1000), NOW).ok).toBe(false);
    expect(parseQuickCaptureBody(at(NOW + LIMITS.capturedAtMaxAheadMs + 1000), NOW).ok).toBe(false);
    // Swift's ISO8601DateFormatter with an offset instead of Z.
    expect(parseQuickCaptureBody({ ...valid, capturedAt: "2026-11-25T11:29:58-07:00" }, NOW).ok).toBe(true);
  });

  it("defaults a missing offset to UTC", () => {
    const { utcOffsetMinutes: _drop, ...rest } = valid;
    const r = parseQuickCaptureBody(rest, NOW);
    expect(r.ok && r.value.utcOffsetMinutes).toBe(0);
  });
});

describe("localDateAndTimeOfDay", () => {
  it("dates the moment where the phone was", () => {
    // 03:30 UTC on the 26th is 20:30 on the 25th in Denver (UTC-7).
    const at = Date.parse("2026-11-26T03:30:00Z");
    expect(localDateAndTimeOfDay(at, -420)).toEqual({ date: "2026-11-25", timeOfDay: "Evening" });
    expect(localDateAndTimeOfDay(at, 0)).toEqual({ date: "2026-11-26", timeOfDay: "Late Night" });
    expect(localDateAndTimeOfDay(at, 9 * 60)).toEqual({ date: "2026-11-26", timeOfDay: "Afternoon" });
    expect(localDateAndTimeOfDay(Date.parse("2026-11-26T08:00:00Z"), 0).timeOfDay).toBe("Morning");
  });
});

describe("mirrors of the app's rules", () => {
  it("reads an iTunes lookup the way lib/songMetadata.ts does", () => {
    const responses = [
      {
        results: [
          {
            trackId: 1440831203,
            previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a",
            collectionName: " Bon Iver ",
            primaryGenreName: "Alternative",
            releaseDate: "2011-06-17T07:00:00Z",
            artistId: 15521979,
            collectionId: 1440830922,
            trackTimeMillis: 336000,
          },
        ],
      },
      { results: [{ trackId: 1, releaseDate: "2020-02-30T00:00:00Z", artistId: 0, collectionId: "abc", trackTimeMillis: -4 }] },
      { results: [] },
      {},
    ];
    for (const json of responses) {
      const { artworkUrl: _artwork, ...ours } = songLookupFromResponse(json, "1440831203");
      expect(ours).toEqual(parseItunesLookupResult(pickLookupResult(json)));
    }
  });

  it("keeps https artwork at 600px and drops other URLs", () => {
    const art = (artworkUrl100: unknown, previewUrl?: unknown) =>
      songLookupFromResponse({ results: [{ trackId: 5, artworkUrl100, previewUrl }] }, "5");
    expect(art("https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg").artworkUrl).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg"
    );
    expect(art("http://example.com/100x100bb.jpg").artworkUrl).toBeNull();
    expect(art(undefined, "http://insecure/p.m4a").previewUrl).toBeNull();
  });

  it("picks the requested track when the response lists several", () => {
    const json = { results: [{ wrapperType: "collection" }, { trackId: 9, trackTimeMillis: 1000 }, { trackId: 5, trackTimeMillis: 2000 }] };
    expect(songLookupFromResponse(json, "5").durationMs).toBe(2000);
    expect(songLookupFromResponse(json, "404").durationMs).toBe(1000);
  });
});

describe("backgroundMomentRow", () => {
  it("builds the row for the key's owner, with no words and capture_source background", () => {
    const parsed = parseQuickCaptureBody(valid, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    const lookup = songLookupFromResponse(
      {
        results: [
          {
            trackId: 1440831203,
            previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a",
            collectionName: "Bon Iver, Bon Iver",
            artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
            primaryGenreName: "Alternative",
            trackTimeMillis: 336000,
          },
        ],
      },
      "1440831203"
    );
    const row = backgroundMomentRow("user-1", parsed.value, lookup);
    expect(row).toMatchObject({
      user_id: "user-1",
      song_title: "Holocene",
      song_artist: "Bon Iver",
      // The player's album name wins over the catalog's.
      song_album_name: "Bon Iver",
      song_artwork_url: "https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg",
      song_provider: "apple_music",
      song_apple_music_id: "1440831203",
      song_preview_url: "https://audio-ssl.itunes.apple.com/p.m4a",
      song_genre: "Alternative",
      song_duration_ms: 336000,
      // Never from the player's position: the part is only picked by hand.
      song_part_ms: null,
      reflection_text: "",
      moods: [],
      people: [],
      moment_date: "2026-11-25",
      time_of_day: "Morning",
      capture_source: "background",
    });
  });

  it("saves a song outside the catalog with no preview or details", () => {
    const parsed = parseQuickCaptureBody({ ...valid, appleMusicId: "0", album: null }, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    const row = backgroundMomentRow("user-1", parsed.value, EMPTY_SONG_LOOKUP);
    expect(row.song_apple_music_id).toBeNull();
    expect(row.song_preview_url).toBeNull();
    expect(row.song_album_name).toBeNull();
  });

  it("ignores a position sent by an older client", () => {
    const parsed = parseQuickCaptureBody({ ...valid, positionMs: 161400, durationMs: 336000 }, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value).not.toHaveProperty("positionMs");
    expect(backgroundMomentRow("user-1", parsed.value, EMPTY_SONG_LOOKUP).song_part_ms).toBeNull();
  });

  it("never takes user_id from the request body", () => {
    const parsed = parseQuickCaptureBody({ ...valid, user_id: "someone-else", userId: "someone-else" }, NOW);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(backgroundMomentRow("owner", parsed.value, EMPTY_SONG_LOOKUP).user_id).toBe("owner");
  });

  it("cleans catalog ids", () => {
    expect(cleanAppleMusicId("0042")).toEqual({ ok: false, error: "appleMusicId is not a catalog id" });
    expect(cleanAppleMusicId(1440831203)).toEqual({ ok: true, value: "1440831203" });
  });
});
