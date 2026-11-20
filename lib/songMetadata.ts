/**
 * What the iTunes lookup (`/lookup?id={appleMusicId}`) tells us about a song,
 * and the `moments` columns it fills. Capture already makes this call for the
 * preview clip; the same response carries the genre, release date, artist and
 * album ids and the length, kept for Insights (favorite genres, musical
 * periods). Pure: no I/O, importable from vitest and scripts.
 *
 * ISRC is not in this response; it needs the MusicKit catalog (later).
 */

/** The fields of one iTunes lookup result this app reads. All optional. */
export interface ItunesLookupResult {
  trackId?: number;
  previewUrl?: string;
  collectionName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  artistId?: number | string;
  collectionId?: number | string;
  trackTimeMillis?: number;
}

/** The preview plus the song details saved on the moment. Every field may be null. */
export interface SongLookup {
  previewUrl: string | null;
  albumName: string | null;
  genre: string | null;
  /** "YYYY-MM-DD" */
  releaseDate: string | null;
  artistId: string | null;
  albumId: string | null;
  durationMs: number | null;
}

export const EMPTY_SONG_LOOKUP: SongLookup = {
  previewUrl: null,
  albumName: null,
  genre: null,
  releaseDate: null,
  artistId: null,
  albumId: null,
  durationMs: null,
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A catalog id as text. iTunes sends numbers; 0 or negatives mean nothing. */
const id = (v: unknown): string | null => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : null;
  return typeof v === "string" && /^\d+$/.test(v.trim()) ? v.trim() : null;
};

const INT_MAX = 2_147_483_647;

/**
 * The calendar date of an iTunes release date. iTunes sends an ISO timestamp
 * ("1977-09-29T12:00:00Z", or midnight Pacific as "…T07:00:00Z"); its date
 * part is the release day as the store lists it.
 */
export function releaseDateToDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Rejects "2020-02-30" and the like, which Postgres would refuse.
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** One lookup result to a SongLookup. Missing or malformed fields become null. */
export function parseItunesLookupResult(result: ItunesLookupResult | null | undefined): SongLookup {
  if (!result || typeof result !== "object") return EMPTY_SONG_LOOKUP;
  const ms = result.trackTimeMillis;
  return {
    previewUrl: text(result.previewUrl),
    albumName: text(result.collectionName),
    genre: text(result.primaryGenreName),
    releaseDate: releaseDateToDate(result.releaseDate),
    artistId: id(result.artistId),
    albumId: id(result.collectionId),
    durationMs: typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms <= INT_MAX ? Math.round(ms) : null,
  };
}

/**
 * The song's result in a lookup response: the first track (a lookup by a song
 * id returns the song, and with `entity=song` can list more), else the first
 * result.
 */
export function pickLookupResult(json: unknown): ItunesLookupResult | null {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const track = results.find((r) => r && typeof r === "object" && (r as ItunesLookupResult).trackId);
  return (track ?? results[0]) as ItunesLookupResult;
}

/** The song metadata columns on `moments`, from a lookup. */
export function songMetadataColumns(lookup: SongLookup) {
  return {
    song_genre: lookup.genre,
    song_release_date: lookup.releaseDate,
    song_artist_id: lookup.artistId,
    song_album_id: lookup.albumId,
    song_duration_ms: lookup.durationMs,
  };
}
