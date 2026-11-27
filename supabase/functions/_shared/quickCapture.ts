// Pure helpers for the capture-key and quick-capture edge functions
// ("Remember this song", docs/PLAN-1.5.md section 3). No network, no
// database, no Deno APIs: vitest covers them in quickCapture.test.ts, which
// also checks the song-lookup rules against the app's own copy
// (lib/songMetadata.ts). Edge functions can't import from lib/, so those few
// lines are repeated here and the test keeps them in step.
//
// A background save never sets the part of the song (song_part_ms): the
// player's position isn't accurate enough, so the part is only ever picked
// by hand (Josh, 2026-11-23). The request has no position field.
//
// Artwork only ever comes from the iTunes lookup. The intent never sends an
// artworkUrl; one in the body is ignored, so a leaked key can't plant an
// arbitrary image URL (a tracking beacon) in the owner's journal.

export const LIMITS = {
  titleMax: 300,
  artistMax: 300,
  albumMax: 300,
  deviceLabelMax: 80,
  // The whole quick-capture body; a real one is a few hundred bytes.
  bodyMaxBytes: 8 * 1024,
  // Background saves per person, per rolling hour.
  savesPerHour: 30,
  // Live keys per person. Past this, issuing a key retires the least
  // recently used ones instead of refusing (a person who reinstalls a lot
  // must never be locked out of Siri).
  liveKeysPerUser: 10,
  // Keys made per person per rolling hour, revoked ones included.
  keysPerHour: 20,
  // The same song saved again this soon returns the first moment: Siri
  // retrying, or "remember this song" said twice.
  duplicateWindowMs: 2 * 60 * 1000,
  // capturedAt may be this far behind the server's clock...
  capturedAtMaxAgeMs: 24 * 60 * 60 * 1000,
  // ...and this far ahead (phone clocks drift).
  capturedAtMaxAheadMs: 10 * 60 * 1000,
  // UTC-12 to UTC+14, with room to spare.
  utcOffsetMaxMinutes: 16 * 60,
  // A key's whole life. The app replaces its key every 30 days while it's
  // opened (lib/captureKeyPayload.ts KEY_ROTATE_AFTER_MS), so only a phone
  // that has gone months without opening Soundtracks meets this.
  keyMaxAgeMs: 90 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Whether a key row may still save: not revoked, and younger than
 * keyMaxAgeMs. A leaked key, or one left on a phone that lost its session
 * some other way, stops working on its own.
 */
export function keyIsLive(row: { created_at: string; revoked_at: string | null }, nowMs: number): boolean {
  if (row.revoked_at) return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && nowMs - created < LIMITS.keyMaxAgeMs;
}

/** "stc_" + 32 random bytes as base64url (43 characters). */
export const CAPTURE_KEY_PATTERN = /^stc_[A-Za-z0-9_-]{43}$/;

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new capture key secret: 32 bytes from the platform CSPRNG. */
export function newCaptureKey(): string {
  return `stc_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The secret from `Authorization: Capture <secret>`, or null for anything
 * else (a missing header, a JWT, a malformed key). Malformed keys never reach
 * the database.
 */
export function captureKeyFromHeader(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null;
  const m = /^Capture\s+(\S+)$/.exec(header.trim());
  return m && CAPTURE_KEY_PATTERN.test(m[1]) ? m[1] : null;
}

/** An install id made by the app; junk becomes null. */
export function cleanDeviceId(raw: unknown): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null;
}

/** A label is optional and only ever displayed: whitespace collapsed, capped. */
export function cleanDeviceLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Control characters out; the label is display text.
  const printable = Array.from(raw, (ch) => {
    const c = ch.charCodeAt(0);
    return c < 32 || c === 127 ? " " : ch;
  }).join("");
  const label = printable.replace(/\s+/g, " ").trim();
  return label ? label.slice(0, LIMITS.deviceLabelMax) : null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/** What the intent sends, validated. */
export interface QuickCaptureInput {
  appleMusicId: string | null;
  title: string;
  artist: string;
  album: string | null;
  /** The phone's storefront (ISO 3166 alpha-2, lowercase), for the lookup. */
  country: string | null;
  capturedAtMs: number;
  utcOffsetMinutes: number;
}

function requiredText(raw: unknown, field: string, max: number): Result<string> {
  if (typeof raw !== "string") return fail(`${field} is required`);
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return fail(`${field} is required`);
  if (value.length > max) return fail(`${field} is too long`);
  return ok(value);
}

function optionalText(raw: unknown, field: string, max: number): Result<string | null> {
  if (raw === undefined || raw === null) return ok(null);
  if (typeof raw !== "string") return fail(`${field} must be a string`);
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) return ok(null);
  if (value.length > max) return fail(`${field} is too long`);
  return ok(value);
}

/** Catalog ids are digits; the player reports "0" or "" for songs not in it. */
export function cleanAppleMusicId(raw: unknown): Result<string | null> {
  if (raw === undefined || raw === null || raw === "" || raw === "0" || raw === 0) return ok(null);
  if (typeof raw !== "string" && typeof raw !== "number") return fail("appleMusicId must be a string");
  const id = String(raw).trim();
  return /^[1-9][0-9]{0,14}$/.test(id) ? ok(id) : fail("appleMusicId is not a catalog id");
}

/**
 * The storefront country, lowercased, or null. Optional (build 20 doesn't
 * send it) and only a hint for the lookup, so anything that isn't two
 * letters (a numeric region like "419", junk) is dropped rather than
 * refused: a bad hint must never lose a capture.
 */
export function cleanCountry(raw: unknown): string | null {
  return typeof raw === "string" && /^[A-Za-z]{2}$/.test(raw.trim()) ? raw.trim().toLowerCase() : null;
}

/**
 * The quick-capture body, strictly: unknown types are refused rather than
 * coerced, and every bound is the column's or tighter. `nowMs` is the
 * server's clock.
 */
export function parseQuickCaptureBody(body: unknown, nowMs: number): Result<QuickCaptureInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("body must be a JSON object");
  const b = body as Record<string, unknown>;

  const appleMusicId = cleanAppleMusicId(b.appleMusicId);
  if (!appleMusicId.ok) return appleMusicId;
  const title = requiredText(b.title, "title", LIMITS.titleMax);
  if (!title.ok) return title;
  const artist = requiredText(b.artist, "artist", LIMITS.artistMax);
  if (!artist.ok) return artist;
  const album = optionalText(b.album, "album", LIMITS.albumMax);
  if (!album.ok) return album;
  // b.artworkUrl is deliberately not read (see the header).

  if (typeof b.capturedAt !== "string" || b.capturedAt.length > 40) return fail("capturedAt is required");
  // ISO 8601 with a zone, as Swift's ISO8601DateFormatter writes it.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/.test(b.capturedAt)) {
    return fail("capturedAt must be an ISO 8601 timestamp");
  }
  const capturedAtMs = Date.parse(b.capturedAt);
  if (!Number.isFinite(capturedAtMs)) return fail("capturedAt must be an ISO 8601 timestamp");
  if (capturedAtMs < nowMs - LIMITS.capturedAtMaxAgeMs || capturedAtMs > nowMs + LIMITS.capturedAtMaxAheadMs) {
    return fail("capturedAt is out of range");
  }

  let utcOffsetMinutes = 0;
  if (b.utcOffsetMinutes !== undefined && b.utcOffsetMinutes !== null) {
    const o = b.utcOffsetMinutes;
    if (typeof o !== "number" || !Number.isInteger(o) || Math.abs(o) > LIMITS.utcOffsetMaxMinutes) {
      return fail("utcOffsetMinutes is out of range");
    }
    utcOffsetMinutes = o;
  }

  return ok({
    appleMusicId: appleMusicId.value,
    title: title.value,
    artist: artist.value,
    album: album.value,
    country: cleanCountry(b.country),
    capturedAtMs,
    utcOffsetMinutes,
  });
}

/** Same buckets as the app's capture (lib/saveMoment.ts getTimeOfDay). */
export function timeOfDayForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late Night";
}

/**
 * The capture's calendar date ("YYYY-MM-DD") and time of day where the phone
 * was, from the instant and the phone's UTC offset at that instant.
 */
export function localDateAndTimeOfDay(capturedAtMs: number, utcOffsetMinutes: number): { date: string; timeOfDay: string } {
  const local = new Date(capturedAtMs + utcOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, timeOfDay: timeOfDayForHour(local.getUTCHours()) };
}

// ── Mirrors of the app's rules (kept in step by quickCapture.test.ts) ──────

/** lib/songMetadata.ts SongLookup, plus the artwork (the intent has none to send). */
export interface SongLookup {
  previewUrl: string | null;
  albumName: string | null;
  genre: string | null;
  releaseDate: string | null;
  artistId: string | null;
  albumId: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
}

export const EMPTY_SONG_LOOKUP: SongLookup = {
  previewUrl: null,
  albumName: null,
  genre: null,
  releaseDate: null,
  artistId: null,
  albumId: null,
  durationMs: null,
  artworkUrl: null,
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const catalogId = (v: unknown): string | null => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : null;
  return typeof v === "string" && /^\d+$/.test(v.trim()) ? v.trim() : null;
};
const INT_MAX = 2_147_483_647;

export function releaseDateToDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/**
 * The iTunes lookup URL. With a storefront country the lookup finds songs
 * that aren't in the US store; without one it's the US store, as before.
 */
export function itunesLookupUrl(appleMusicId: string, country: string | null): string {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleMusicId)}`;
  return country ? `${url}&country=${encodeURIComponent(country)}` : url;
}

/** Whether a lookup found anything worth writing to the moment. */
export function hasLookupDetails(lookup: SongLookup): boolean {
  return Object.values(lookup).some((v) => v !== null);
}

/**
 * The song's details from an iTunes lookup response (`/lookup?id=`): the
 * result whose trackId is the id asked for, else the first track. Missing or
 * malformed fields become null; only https URLs are kept.
 */
export function songLookupFromResponse(json: unknown, appleMusicId: string): SongLookup {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return EMPTY_SONG_LOOKUP;
  const tracks = results.filter((r) => r && typeof r === "object" && (r as { trackId?: unknown }).trackId);
  const r = (tracks.find((t) => String((t as { trackId?: unknown }).trackId) === appleMusicId) ??
    tracks[0] ??
    results[0]) as Record<string, unknown>;
  if (!r || typeof r !== "object") return EMPTY_SONG_LOOKUP;
  const https = (v: unknown) => {
    const s = text(v);
    return s && s.startsWith("https://") ? s : null;
  };
  const ms = r.trackTimeMillis;
  const artwork = https(r.artworkUrl100);
  return {
    previewUrl: https(r.previewUrl),
    albumName: text(r.collectionName)?.slice(0, LIMITS.albumMax) ?? null,
    genre: text(r.primaryGenreName),
    releaseDate: releaseDateToDate(r.releaseDate),
    artistId: catalogId(r.artistId),
    albumId: catalogId(r.collectionId),
    durationMs: typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms <= INT_MAX ? Math.round(ms) : null,
    artworkUrl: artwork ? artwork.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null,
  };
}

/**
 * The moment's columns that come from the iTunes lookup. A background save
 * inserts with EMPTY_SONG_LOOKUP first and writes these afterwards, so the
 * row exists (and a second save sees it) before the slow lookup runs.
 */
export function songLookupColumns(input: QuickCaptureInput, lookup: SongLookup) {
  return {
    // The player's album name wins over the catalog's.
    song_album_name: input.album ?? lookup.albumName,
    song_artwork_url: lookup.artworkUrl,
    song_preview_url: lookup.previewUrl,
    song_genre: lookup.genre,
    song_release_date: lookup.releaseDate,
    song_artist_id: lookup.artistId,
    song_album_id: lookup.albumId,
    song_duration_ms: lookup.durationMs,
  };
}

/**
 * The moments row for a background save. `userId` comes from the key row,
 * never from the request.
 */
export function backgroundMomentRow(userId: string, input: QuickCaptureInput, lookup: SongLookup = EMPTY_SONG_LOOKUP) {
  const { date, timeOfDay } = localDateAndTimeOfDay(input.capturedAtMs, input.utcOffsetMinutes);
  return {
    user_id: userId,
    song_title: input.title,
    song_artist: input.artist,
    song_provider: "apple_music",
    song_apple_music_id: input.appleMusicId,
    song_spotify_id: null,
    ...songLookupColumns(input, lookup),
    // Never set automatically; picked by hand in the app.
    song_part_ms: null,
    reflection_text: "",
    mood: null,
    moods: [] as string[],
    people: [] as string[],
    moment_date: date,
    time_of_day: timeOfDay,
    capture_source: "background",
  };
}

/** A background moment as the duplicate check reads it. */
export interface RecentCapture {
  id: string;
  song_title: string;
  song_artist: string;
  created_at: string;
}

/**
 * The copy every concurrent save agrees to keep: the earliest by created_at,
 * then id. A total order, so two saves that each see both rows pick the same
 * one, and at most one of them removes its own.
 */
export function keptCapture<T extends { id: string; created_at: string }>(rows: readonly T[]): T | null {
  let kept: T | null = null;
  for (const r of rows) {
    if (!kept) {
      kept = r;
      continue;
    }
    const a = Date.parse(r.created_at);
    const b = Date.parse(kept.created_at);
    if (a < b || (a === b && r.id < kept.id)) kept = r;
  }
  return kept;
}
