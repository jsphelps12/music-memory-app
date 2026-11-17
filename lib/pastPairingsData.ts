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
import type { Song } from "@/types";

const LIBRARY_LIMIT = 8000;
// v3: picks weigh location and favourites too (2026-11-17); older picks are recomputed.
const PICKS_KEY = "frombefore_picks_v3";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SHOWN_KEY = "frombefore_shown_v1";
const SHOWN_MAX = 300;
const THUMBS = 4;

export interface PastPairing {
  song: PastSong;
  photoCount: number;
  photoUris: string[];
  favorites?: number;
  /** Mostly taken away from home. */
  away?: boolean;
  /** The town for an away week ("Kailua-Kona"), when it could be named. */
  place?: string | null;
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
      first: withThumbs ? 12 : 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    const uris = withThumbs
      ? page.assets.filter((a) => !(a.mediaSubtypes ?? []).includes("screenshot")).slice(0, THUMBS).map((a) => a.uri)
      : [];
    return { count: page.totalCount, uris };
  } catch {
    return { count: 0, uris: [] };
  }
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
 * Each candidate's week of photos: how many, how many favourited, and
 * whether they were mostly taken away from home (home being where a year of
 * photos cluster). PhotoKit metadata in one native call; on a build without
 * it, counts only.
 */
async function scoreCandidates(candidates: PastSong[], now: number): Promise<ScoredPairing[]> {
  const ranges = candidates.map((s) => {
    const { from, to } = photoWindow(s.at);
    return [from, to] as [number, number];
  });
  const stats = await photoStats(ranges, 20);
  if (stats) {
    const year = await photoStats([[now - YEAR_MS, now]], 400);
    const home = homeFrom((year?.[0]?.coords ?? []) as Coord[]);
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
  const cached = await readJson<{ weekKey: string; picks: PastPairing[] } | null>(PICKS_KEY, null);
  if (cached && cached.weekKey === week.key) return finish(userId, cached.picks);

  if (libraryAccessStatus() !== "authorized" || !(await photosAllowed())) return EMPTY;
  const library = (await getLibrarySongs(LIBRARY_LIMIT)) as LibraryTrack[];
  const shown = await readJson<string[]>(SHOWN_KEY, []);
  const pool = fromBeforeCandidates(library, now, new Set(shown), FROM_BEFORE_CANDIDATES * 2);
  const storeIds = pool.map((s) => s.storeId).filter((id): id is string => !!id);
  const saved = await savedByStoreId(userId, storeIds).catch(() => ({}) as Record<string, string>);
  const candidates = pool.filter((s) => !(s.storeId && saved[s.storeId])).slice(0, FROM_BEFORE_CANDIDATES);

  const scored = await scoreCandidates(candidates, now);

  const picks: PastPairing[] = await Promise.all(
    pickFromBefore(scored).map(async ({ song, photos, favorites, away, awayAt }) => {
      const { from, to } = photoWindow(song.at);
      const p = await photosIn(from, to, true);
      const place = away && awayAt ? await placeName(awayAt) : null;
      return { song, photoCount: photos, photoUris: p.uris, favorites, away, place };
    })
  );

  try {
    await AsyncStorage.setItem(PICKS_KEY, JSON.stringify({ weekKey: week.key, picks }));
    const nextShown = [...shown, ...picks.map((p) => p.song.key)].slice(-SHOWN_MAX);
    await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(nextShown));
  } catch {}
  return finish(userId, picks);
}
