// Reading the phone for lib/pastPairings.ts: On this day from the library, and
// From before, picked once a week and kept for the week (so Rediscover
// doesn't change under you and doesn't re-scan photos on every visit). The
// songs it has shown are remembered so later weeks bring new ones. All on
// the device; only the "Saved" check reads the user's moments.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import { currentWeek, type LibraryTrack } from "@/lib/lastWeek";
import { lookupCatalog, savedByStoreId } from "@/lib/lastWeekData";
import { photoWindow } from "@/lib/libraryMoments";
import {
  centroid,
  FROM_BEFORE_CANDIDATES,
  fromBeforeCandidates,
  homeFrom,
  isAway,
  onThisDaySongs,
  pickFromBefore,
  type Coord,
  type PastSong,
  type ScoredPairing,
} from "@/lib/pastPairings";
import { getLibrarySongs, libraryAccessStatus, photoStats } from "@/modules/now-playing";
import { analysesFor, bestFirst } from "@/lib/photoAnalysisStore";
import { lookAtWeek, lookBonus, sampleEvenly, type EventKind, type WeekLook } from "@/lib/photoInterest";
import type { QuestionFacts } from "@/lib/nudgeQuestion";
import type { Song } from "@/types";

const LIBRARY_LIMIT = 8000;
// v4: picks also weigh what the photos show (2026-11-17); older picks are recomputed.
const PICKS_KEY = "frombefore_picks_v4";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SHOWN_KEY = "frombefore_shown_v1";
const DISMISSED_KEY = "frombefore_dismissed_v1";
const DISMISSED_MAX = 500;
const HOME_TTL_MS = 24 * 60 * 60 * 1000;
const SHOWN_MAX = 300;
const THUMBS = 4;
/** Candidate weeks whose photos get looked at, and photos per week. */
const LOOK_CANDIDATES = 10;
const LOOK_SAMPLE = 8;

export interface PastPairing {
  song: PastSong;
  photoCount: number;
  photoUris: string[];
  favorites?: number;
  /** Mostly taken away from home. */
  away?: boolean;
  /** The town for an away week ("Kailua-Kona"), when it could be named. */
  place?: string | null;
  /** What kind of week it was ("beach"), from its photos. */
  event?: EventKind | null;
}

export interface PastPairings {
  pairings: PastPairing[];
  catalog: Record<string, Song>;
  /** PastSong.key → moment id, for songs saved since. */
  saved: Record<string, string>;
}

const EMPTY: PastPairings = { pairings: [], catalog: {}, saved: {} };

async function photosAllowed(): Promise<boolean> {
  try {
    return (await MediaLibrary.getPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}

/** Photos taken in [from, to): how many, and the first few camera ones. */
async function photosIn(from: number, to: number, withThumbs: boolean): Promise<{ count: number; uris: string[] }> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: from,
      createdBefore: to,
      first: withThumbs ? 40 : 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    if (!withThumbs) return { count: page.totalCount, uris: [] };
    // The best of the week leads, not the first; homework and receipts don't show.
    const camera = page.assets.filter((a) => !(a.mediaSubtypes ?? []).includes("screenshot"));
    const best = await bestFirst(camera);
    return { count: page.totalCount, uris: best.slice(0, THUMBS).map((a) => a.uri) };
  } catch {
    return { count: 0, uris: [] };
  }
}

/** What a week's photos show, from a sample of them. Null without the module. */
async function weekLook(from: number, to: number): Promise<WeekLook | null> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: from,
      createdBefore: to,
      first: 80,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    const sample = sampleEvenly(
      page.assets.filter((a) => !(a.mediaSubtypes ?? []).includes("screenshot")),
      LOOK_SAMPLE
    );
    const analyses = await analysesFor(sample.map((a) => a.id));
    if (!analyses) return null;
    return lookAtWeek([...analyses.values()]);
  } catch {
    return null;
  }
}

/**
 * Looks at the photos of the strongest candidates (scenes, people, boring
 * ones) and folds it in: boring photos stop counting, events and group
 * shots add to the score, and the week gets its kind ("at the beach").
 */
async function refineWithLooks(scored: ScoredPairing[]): Promise<ScoredPairing[]> {
  const top = pickFromBefore(scored, LOOK_CANDIDATES);
  const looks = new Map<string, WeekLook>();
  for (const p of top) {
    const { from, to } = photoWindow(p.song.at);
    const look = await weekLook(from, to);
    if (look) looks.set(p.song.key, look);
  }
  if (looks.size === 0) return scored;
  return scored.map((s) => {
    const look = looks.get(s.song.key);
    if (!look) return s;
    return {
      ...s,
      photos: Math.round(s.photos * (1 - look.boringShare)),
      bonus: lookBonus(look),
      event: look.event,
    };
  });
}

function dayBounds(day: string): { from: number; to: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { from: new Date(y, m - 1, d).getTime(), to: new Date(y, m - 1, d + 1).getTime() };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function finish(userId: string, pairings: PastPairing[]): Promise<PastPairings> {
  const storeIds = pairings.map((p) => p.song.storeId).filter((id): id is string => !!id);
  const [catalog, savedIds] = await Promise.all([
    lookupCatalog(storeIds),
    savedByStoreId(userId, storeIds).catch(() => ({}) as Record<string, string>),
  ]);
  const saved: Record<string, string> = {};
  for (const p of pairings) if (p.song.storeId && savedIds[p.song.storeId]) saved[p.song.key] = savedIds[p.song.storeId];
  return { pairings, catalog, saved };
}

/**
 * Songs added on today's date in past years, with that day's photos. Songs
 * already saved as moments are left out: those moments show in On this day
 * themselves.
 */
export async function loadPhoneOnThisDay(userId: string, now = Date.now()): Promise<PastPairings> {
  if (libraryAccessStatus() !== "authorized") return EMPTY;
  const library = (await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[];
  const songs = onThisDaySongs(library, now);
  if (songs.length === 0) return EMPTY;

  const storeIds = songs.map((s) => s.storeId).filter((id): id is string => !!id);
  const already = await savedByStoreId(userId, storeIds).catch(() => ({}) as Record<string, string>);
  const fresh = songs.filter((s) => !(s.storeId && already[s.storeId]));
  const withPhotos = await photosAllowed();
  const pairings = await Promise.all(
    fresh.map(async (song) => {
      const { from, to } = dayBounds(song.day);
      const p = withPhotos ? await photosIn(from, to, true) : { count: 0, uris: [] };
      return { song, photoCount: p.count, photoUris: p.uris };
    })
  );
  return finish(userId, pairings);
}

/**
 * Each candidate's week of photos: how many, how many favorited, and
 * whether they were mostly taken away from home (home being where a year of
 * photos cluster). PhotoKit metadata in one native call; on a build without
 * it, counts only.
 */
// Home moves rarely; browsing asks for it on every "Show more".
let homeCache: { at: number; home: Coord | null } | null = null;

async function estimateHome(now: number): Promise<Coord | null> {
  if (homeCache && now - homeCache.at < HOME_TTL_MS) return homeCache.home;
  const year = await photoStats([[now - YEAR_MS, now]], 400);
  const home = homeFrom((year?.[0]?.coords ?? []) as Coord[]);
  homeCache = { at: now, home };
  return home;
}

async function scoreCandidates(candidates: PastSong[], now: number): Promise<ScoredPairing[]> {
  const ranges = candidates.map((s) => {
    const { from, to } = photoWindow(s.at);
    return [from, to] as [number, number];
  });
  const stats = await photoStats(ranges, 20);
  if (stats) {
    const home = await estimateHome(now);
    return candidates.map((song, i) => {
      const coords = (stats[i]?.coords ?? []) as Coord[];
      const away = isAway(coords, home);
      return {
        song,
        photos: stats[i]?.count ?? 0,
        favorites: stats[i]?.favorites ?? 0,
        away,
        awayAt: away ? centroid(coords) : null,
      };
    });
  }
  const scored: ScoredPairing[] = [];
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8);
    const counts = await Promise.all(batch.map((song, j) => photosIn(ranges[i + j][0], ranges[i + j][1], false)));
    batch.forEach((song, j) => scored.push({ song, photos: counts[j].count }));
  }
  return scored;
}

/** "Kailua-Kona", from Apple's geocoder; null if it can't be named. */
async function placeName([latitude, longitude]: Coord): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude, longitude });
    return r?.city || r?.region || r?.country || null;
  } catch {
    return null;
  }
}

/**
 * This week's From before: up to three old pairings, chosen the first time
 * Rediscover is opened in a week and kept until the next.
 */
export async function loadFromBefore(userId: string, now = Date.now()): Promise<PastPairings> {
  const week = currentWeek(now);
  const dismissed = new Set(await readJson<string[]>(DISMISSED_KEY, []));
  const cached = await readJson<{ weekKey: string; picks: PastPairing[] } | null>(PICKS_KEY, null);
  if (cached && cached.weekKey === week.key) {
    return finish(userId, cached.picks.filter((p) => !dismissed.has(p.song.key)));
  }

  if (libraryAccessStatus() !== "authorized" || !(await photosAllowed())) return EMPTY;
  const library = (await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[];
  const shown = await readJson<string[]>(SHOWN_KEY, []);
  const pool = fromBeforeCandidates(library, now, new Set([...shown, ...dismissed]), FROM_BEFORE_CANDIDATES * 2);
  const storeIds = pool.map((s) => s.storeId).filter((id): id is string => !!id);
  const saved = await savedByStoreId(userId, storeIds).catch(() => ({}) as Record<string, string>);
  const candidates = pool.filter((s) => !(s.storeId && saved[s.storeId])).slice(0, FROM_BEFORE_CANDIDATES);

  const scored = await refineWithLooks(await scoreCandidates(candidates, now));

  const picks: PastPairing[] = await Promise.all(
    pickFromBefore(scored).map(async ({ song, photos, favorites, away, awayAt, event }) => {
      const { from, to } = photoWindow(song.at);
      const p = await photosIn(from, to, true);
      const place = away && awayAt ? await placeName(awayAt) : null;
      return { song, photoCount: photos, photoUris: p.uris, favorites, away, place, event };
    })
  );

  try {
    await AsyncStorage.setItem(PICKS_KEY, JSON.stringify({ weekKey: week.key, picks }));
    const nextShown = [...shown, ...picks.map((p) => p.song.key)].slice(-SHOWN_MAX);
    await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(nextShown));
  } catch {}
  return finish(userId, picks);
}

// ── Browsing (the From before screen) ──────────────────────────────────────

/** "Not this one": never pick this song again. */
export async function dismissPairing(key: string): Promise<void> {
  const dismissed = await readJson<string[]>(DISMISSED_KEY, []);
  if (!dismissed.includes(key)) dismissed.push(key);
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.slice(-DISMISSED_MAX)));
  } catch {}
}

/** Years with songs old enough for From before, newest first. */
export async function fromBeforeYears(now = Date.now()): Promise<number[]> {
  if (libraryAccessStatus() !== "authorized") return [];
  const library = (await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[];
  const years = new Set(fromBeforeCandidates(library, now, new Set(), 100000).map((s) => new Date(s.at).getFullYear()));
  return [...years].sort((a, b) => b - a);
}

/**
 * Pairings to browse, beyond the weekly three: from one year or all, the
 * best `limit` (one per month), skipping saved and dismissed songs. Not
 * cached and doesn't count as "shown".
 */
export async function browseFromBefore(
  userId: string,
  year: number | null,
  limit: number,
  now = Date.now()
): Promise<PastPairings> {
  if (libraryAccessStatus() !== "authorized" || !(await photosAllowed())) return EMPTY;
  const library = ((await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[]).filter(
    (t) => year === null || new Date(t.dateAdded).getFullYear() === year
  );
  const dismissed = new Set(await readJson<string[]>(DISMISSED_KEY, []));
  const pool = fromBeforeCandidates(library, now, dismissed, 160);
  const storeIds = pool.map((s) => s.storeId).filter((id): id is string => !!id);
  const saved = await savedByStoreId(userId, storeIds).catch(() => ({}) as Record<string, string>);
  const candidates = pool.filter((s) => !(s.storeId && saved[s.storeId])).slice(0, 120);
  const scored = await refineWithLooks(await scoreCandidates(candidates, now));
  const picks: PastPairing[] = await Promise.all(
    pickFromBefore(scored, limit).map(async ({ song, photos, favorites, away, awayAt, event }) => {
      const { from, to } = photoWindow(song.at);
      const p = await photosIn(from, to, true);
      const place = away && awayAt ? await placeName(awayAt) : null;
      return { song, photoCount: photos, photoUris: p.uris, favorites, away, place, event };
    })
  );
  return finish(userId, picks);
}

/** The facts a pairing's question may use (lib/nudgeQuestion.ts). */
export function pairingFacts(p: PastPairing): QuestionFacts {
  return {
    song: p.song.title,
    artist: p.song.artistName,
    at: p.song.at,
    place: p.place ?? null,
    event: p.event ?? null,
    photoCount: p.photoCount,
    away: p.away,
  };
}
