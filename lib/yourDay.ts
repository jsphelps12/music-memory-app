/**
 * "Your day (Apple)" (1.5): what a picked Journaling Suggestion fills capture
 * with. The native module (modules/journaling-suggestions) hands over the one
 * suggestion the person picked as plain JSON; this turns it into /create's
 * route params, the same ones Last week and the share extension use. Nothing
 * is saved until the person presses Save.
 *
 * - Song: the first Apple Music song in the suggestion (Apple lists its items
 *   in the order the picker shows them, so that's the one it put first); a
 *   song from another app (iOS 18 "generic media", e.g. Spotify) only when
 *   there's no Apple Music one. Matched to the catalog by title and artist.
 * - Photos: the copies the module made, in order, at most MAX_PHOTOS.
 * - Place: the first one with a name; its coordinates when Apple has them.
 * - People: the contacts' names, as typed names (not linked to friends).
 * - Date: when the suggestion starts, else the earliest dated item.
 * Workouts, videos, podcasts and the rest have nowhere to go in a moment.
 *
 * Pure (the catalog search is passed in): importable from vitest.
 */
import type { Song } from "@/types";
import type { GeoResult } from "@/lib/geocoding";
import { normalizeTitle, versionKey } from "@/lib/itunes";

export interface RawSuggestionSong {
  title: string;
  artist?: string;
  album?: string;
  date?: string;
  /** "song": Apple Music. "media": another app's now playing (iOS 18+). */
  kind?: "song" | "media";
}

export interface RawSuggestionPhoto {
  /** file:// copy in the app's caches. */
  uri: string;
  date?: string;
}

export interface RawSuggestionPlace {
  place?: string;
  city?: string;
  lat?: number;
  lng?: number;
  date?: string;
}

/** What the native module returns for one picked suggestion. */
export interface RawSuggestion {
  title?: string;
  /** ISO date the suggestion starts. */
  date?: string;
  songs?: RawSuggestionSong[];
  photos?: RawSuggestionPhoto[];
  places?: RawSuggestionPlace[];
  people?: string[];
  /** Items with nowhere to go in a moment (workouts, videos, …). */
  skipped?: number;
}

export const MAX_PHOTOS = 10;
export const MAX_PEOPLE = 10;
/** Catalog choices offered when no result is clearly the same recording. */
export const MAX_CANDIDATES = 5;

export interface WantedSong {
  title: string;
  artist: string;
  album: string;
  kind: "song" | "media";
}

/** The song capture should open with: the first Apple Music one, else another app's. */
export function suggestionSong(s: RawSuggestion): WantedSong | null {
  const songs = (s.songs ?? []).filter((x) => typeof x?.title === "string" && x.title.trim());
  const pick = songs.find((x) => (x.kind ?? "song") === "song") ?? songs.find((x) => x.kind === "media");
  if (!pick) return null;
  return {
    title: pick.title.trim(),
    artist: pick.artist?.trim() ?? "",
    album: pick.album?.trim() ?? "",
    kind: pick.kind ?? "song",
  };
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** "Blue Bottle Coffee, Oakland"; just one of them when that's all there is. */
export function placeName(p: RawSuggestionPlace): string | null {
  const place = p.place?.trim() || null;
  const city = p.city?.trim() || null;
  if (place && city && !place.toLowerCase().includes(city.toLowerCase())) return `${place}, ${city}`;
  return place ?? city;
}

/** The first place with a name, as capture's place field holds it. */
export function suggestionPlace(s: RawSuggestion): GeoResult | null {
  for (const p of s.places ?? []) {
    const name = p ? placeName(p) : null;
    if (!name) continue;
    const hasCoords = finite(p.lat) && finite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
    return { name, lat: hasCoords ? p.lat! : null, lng: hasCoords ? p.lng! : null };
  }
  return null;
}

/** Contacts' names, trimmed, each once, at most MAX_PEOPLE. */
export function suggestionPeople(s: RawSuggestion): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of s.people ?? []) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === MAX_PEOPLE) break;
  }
  return out;
}

/** The photo copies, in order, each once, at most MAX_PHOTOS. */
export function suggestionPhotos(s: RawSuggestion): string[] {
  const uris = (s.photos ?? []).map((p) => p?.uri).filter((u): u is string => typeof u === "string" && u.startsWith("file://"));
  return [...new Set(uris)].slice(0, MAX_PHOTOS);
}

function parseDate(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  // A minute of clock skew is fine; a date in the future isn't when it happened.
  return Number.isFinite(ms) && ms > 0 && ms <= now + 60_000 ? Math.min(ms, now) : null;
}

/** When it happened (epoch ms): the suggestion's start, else its earliest dated item. */
export function suggestionDate(s: RawSuggestion, now = Date.now()): number | null {
  const start = parseDate(s.date, now);
  if (start !== null) return start;
  const items = [...(s.songs ?? []), ...(s.photos ?? []), ...(s.places ?? [])];
  const dates = items.map((x) => parseDate(x?.date, now)).filter((d): d is number => d !== null);
  return dates.length ? Math.min(...dates) : null;
}

// ── Song matching ───────────────────────────────────────────────────────────

export type MatchHow = "exact" | "close" | "none";

export interface SongMatch {
  /** The song capture opens with; null when there's nothing worth filling in. */
  song: Song | null;
  /** Catalog choices when the match isn't certain (capture's "Which song?" picker). */
  candidates: Song[];
  how: MatchHow;
}

/** normalizeTitle with accents folded: "Señorita" and "Senorita" are one song. */
function sameTitleKey(title: string): string {
  return normalizeTitle(title.normalize("NFD").replace(/\p{M}/gu, ""));
}

function artistMatches(got: string, want: string): boolean {
  const wanted = want
    .toLowerCase()
    .split(/,|&|\band\b/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (wanted.length === 0) return true;
  const g = got.toLowerCase();
  return wanted.some((a) => g.includes(a) || (g.length > 0 && a.includes(g)));
}

/** The suggestion's own title and artist, for a song the catalog doesn't have. */
export function songWithoutCatalog(want: WantedSong): Song {
  return {
    id: "",
    title: want.title,
    artistName: want.artist,
    albumName: want.album,
    artworkUrl: "",
    provider: "apple_music",
    appleMusicId: null,
    spotifyId: null,
    durationMs: 0,
  };
}

/**
 * The catalog song for a suggested one. Exact: same title (case, accents,
 * punctuation and "feat." aside), same version
 * (remix, live, …) and artist. Close: the same title by that artist in
 * another version, or by someone else; capture asks which when there's more
 * than one. None: an Apple Music song keeps the suggestion's own title and
 * artist (as Last week does for a song the catalog lookup missed); another
 * app's media (which may be a podcast or an audiobook) is left out.
 */
export function matchSuggestionSong(want: WantedSong, results: readonly Song[]): SongMatch {
  const title = sameTitleKey(want.title);
  const version = versionKey(want.title);
  const usable = results.filter((r) => r?.title && (r.appleMusicId || r.id));
  const sameTitle = usable.filter((r) => sameTitleKey(r.title) === title);

  const exact = sameTitle.find((r) => versionKey(r.title) === version && artistMatches(r.artistName, want.artist));
  if (title && exact) return { song: exact, candidates: [], how: "exact" };

  const close = [
    ...sameTitle.filter((r) => artistMatches(r.artistName, want.artist)),
    ...sameTitle.filter((r) => !artistMatches(r.artistName, want.artist)),
  ].slice(0, MAX_CANDIDATES);
  if (title && close.length > 0) return { song: close[0], candidates: close.length > 1 ? close : [], how: "close" };

  return { song: want.kind === "song" ? songWithoutCatalog(want) : null, candidates: [], how: "none" };
}

export type CatalogSearch = (query: string) => Promise<Song[]>;

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/**
 * Matches the suggested song against the catalog searches (Apple Music, then
 * the no-auth iTunes search). All of them start at once, so the whole match
 * takes at most `timeoutMs`; their results are weighed in the order given,
 * so an exact match from an earlier search wins over a later one's, and an
 * exact Apple Music match returns without waiting for iTunes. A search that
 * fails or takes longer than `timeoutMs` counts as no results. Never throws.
 */
export async function resolveSuggestionSong(
  want: WantedSong,
  searches: readonly CatalogSearch[],
  timeoutMs = 6000
): Promise<SongMatch> {
  const query = [want.title, want.artist.split(",")[0]?.trim()].filter(Boolean).join(" ");
  const pending = searches.map((search) =>
    within(
      Promise.resolve().then(() => search(query)),
      timeoutMs,
      [] as Song[]
    )
  );
  let best: SongMatch | null = null;
  for (const results of pending) {
    const match = matchSuggestionSong(want, await results);
    if (match.how === "exact") return match;
    if (!best || (best.how === "none" && match.how === "close")) best = match;
  }
  return best ?? matchSuggestionSong(want, []);
}

// ── Into capture ────────────────────────────────────────────────────────────

/** /create's params for a picked suggestion (source "your_day"). */
export function yourDayCaptureParams(s: RawSuggestion, match: SongMatch | null, now = Date.now()): Record<string, string> {
  const params: Record<string, string> = { source: "your_day" };
  const song = match?.song;
  if (song) {
    Object.assign(params, {
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artistName,
      songAlbum: song.albumName,
      songArtwork: song.artworkUrl,
      songProvider: song.provider,
      songAppleMusicId: song.appleMusicId ?? "",
      songSpotifyId: song.spotifyId ?? "",
      songDurationMs: String(song.durationMs),
    });
    if (match.candidates.length > 1) params.shareCandidates = JSON.stringify(match.candidates);
  }
  const photos = suggestionPhotos(s);
  if (photos.length) params.sharedPhotoPaths = JSON.stringify(photos);
  const at = suggestionDate(s, now);
  if (at !== null) params.momentAt = String(at);
  const place = suggestionPlace(s);
  if (place) {
    params.placeName = place.name;
    if (place.lat !== null && place.lng !== null) {
      params.placeLat = String(place.lat);
      params.placeLng = String(place.lng);
    }
  }
  const people = suggestionPeople(s);
  if (people.length) params.peopleNames = JSON.stringify(people);
  return params;
}

/** capture's place from the route params, or null. */
export function placeFromParams(p: { placeName?: string; placeLat?: string; placeLng?: string }): GeoResult | null {
  const name = p.placeName?.trim();
  if (!name) return null;
  const lat = p.placeLat ? Number(p.placeLat) : NaN;
  const lng = p.placeLng ? Number(p.placeLng) : NaN;
  const ok = Number.isFinite(lat) && Number.isFinite(lng);
  return { name, lat: ok ? lat : null, lng: ok ? lng : null };
}

/** capture's people from the route params ([] when absent or malformed). */
export function peopleFromParams(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? suggestionPeople({ people: parsed.filter((x) => typeof x === "string") }) : [];
  } catch {
    return [];
  }
}

/** Analytics for a pick: counts and flags only, never the content. */
export function yourDayEventProps(s: RawSuggestion, match: SongMatch | null): Record<string, string | number | boolean> {
  const want = suggestionSong(s);
  return {
    songs: s.songs?.length ?? 0,
    song_kind: want?.kind ?? "none",
    song_match: match?.how ?? "none",
    photos: suggestionPhotos(s).length,
    has_place: !!suggestionPlace(s),
    people: suggestionPeople(s).length,
    has_date: suggestionDate(s) !== null,
    skipped: s.skipped ?? 0,
  };
}
