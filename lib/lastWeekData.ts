// "Last week" (1.4): reading the phone for lib/lastWeek.ts. Everything stays
// on the device: the library, Apple Music's recently played list, the photos,
// and the two small records this keeps in AsyncStorage:
// - play counts at the start of each week (song id → lifetime count), so
//   "played 14 times" can mean this week, not ever;
// - when each streamed song first showed up in Apple Music's recently played
//   list, which iOS returns without dates.
// Only the "Saved" check talks to the server (the user's own moments).

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library/legacy";
import { supabase } from "@/lib/supabase";
import { keepInterestingCached } from "@/lib/photoAnalysisStore";
import { itunesTrackToSong, type ItunesTrack } from "@/lib/itunes";
import { dayKey } from "@/lib/libraryMoments";
import { getLibrary } from "@/lib/libraryCache";
import { countsFromLibrary, createSnapshotStore } from "@/lib/lastWeekSnapshots";
import {
  buildWeekSongs,
  currentWeek,
  inWeek,
  lastWeekRange,
  photosOfDays,
  weekHasContent,
  weekPhotosView,
  type LastWeekAccess,
  type StreamedTrack,
  type WeekDay,
  type WeekPhoto,
  type WeekRange,
  type WeekSong,
} from "@/lib/lastWeek";
import { getRecentlyPlayed, libraryAccessStatus, requestLibraryAccess } from "@/modules/now-playing";
import type { Song } from "@/types";

const STREAMED_KEY = "lastweek_streamed_v1";
const DISMISSED_KEY = "lastweek_dismissed_v1";
const SEEN_KEY = "lastweek_seen_v1";
const ASK_DISMISSED_KEY = "lastweek_ask_dismissed_v1";
const DAY_PHOTOS_KEY = "lastweek_suggest_day_photos_v1";
const OBSERVED_AT_KEY = "lastweek_observed_at_v1";

/**
 * Last week's fixed AsyncStorage keys (device-wide, not per account). The
 * per-week play-count snapshots are separate: SNAPSHOT_KEY_PREFIX and
 * LEGACY_SNAPSHOTS_KEY in lib/lastWeekSnapshots.ts.
 */
export const LAST_WEEK_KEYS = [
  STREAMED_KEY,
  DISMISSED_KEY,
  SEEN_KEY,
  ASK_DISMISSED_KEY,
  DAY_PHOTOS_KEY,
  OBSERVED_AT_KEY,
] as const;

/** Don't re-read the whole library on every Journal focus. */
const OBSERVE_EVERY_MS = 3 * 60 * 60 * 1000;
/** How long streamed songs are remembered. */
const KEEP_WEEKS = 5;
const PHOTO_LIMIT = 600;

/** Play counts at the start of each week (lib/lastWeekSnapshots.ts). */
const snapshots = createSnapshotStore(AsyncStorage);

// ── Small stored flags ─────────────────────────────────────────────────────

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function dismissWeek(week: WeekRange): Promise<void> {
  await writeJson(DISMISSED_KEY, week.key);
}

export async function markWeekSeen(weekKey: string): Promise<void> {
  await writeJson(SEEN_KEY, weekKey);
}

export async function dismissAccessAsk(): Promise<void> {
  await writeJson(ASK_DISMISSED_KEY, true);
}

/** Whether create offers that day's photos (on unless switched off). */
export async function suggestDayPhotos(): Promise<boolean> {
  return (await readJson<boolean>(DAY_PHOTOS_KEY, true)) !== false;
}

export async function setSuggestDayPhotos(on: boolean): Promise<void> {
  await writeJson(DAY_PHOTOS_KEY, on);
}

// ── Access ─────────────────────────────────────────────────────────────────

/** Library or photos readable: show what we can. Never prompts. */
export async function lastWeekAccess(): Promise<LastWeekAccess> {
  const library = libraryAccessStatus();
  let photos: string = "undetermined";
  try {
    photos = (await MediaLibrary.getPermissionsAsync()).status;
  } catch {}
  if (library === "authorized" || photos === "granted") return "granted";
  if (library === "notDetermined" || photos === "undetermined") return "undetermined";
  return "denied";
}

/** The one-time ask: Apple Music library, then photos. */
export async function requestLastWeekAccess(): Promise<LastWeekAccess> {
  try {
    if (libraryAccessStatus() === "notDetermined") await requestLibraryAccess();
  } catch {}
  try {
    const p = await MediaLibrary.getPermissionsAsync();
    if (p.status === "undetermined") await MediaLibrary.requestPermissionsAsync();
  } catch {}
  return lastWeekAccess();
}

// ── Observations: play-count snapshots and the streamed log ───────────────

interface StreamedLog {
  /** Store ids from the previous fetch, newest first. */
  lastList: string[] | null;
  /** `${weekKey}:${storeId}` → the song as first seen that week. */
  entries: Record<string, StreamedTrack>;
}

/**
 * Called when the Journal comes into focus (throttled): records this week's
 * starting play counts the first time the app is opened in a week, and any
 * song new to Apple Music's recently played list since the last look.
 */
export async function observeListening(now = Date.now()): Promise<void> {
  const last = await readJson<number>(OBSERVED_AT_KEY, 0);
  if (now - last < OBSERVE_EVERY_MS) return;
  await writeJson(OBSERVED_AT_KEY, now);

  const week = currentWeek(now);

  if (libraryAccessStatus() === "authorized") {
    try {
      if (!(await snapshots.has(week.key))) {
        // Read this week, not a copy cached before Monday.
        const songs = await getLibrary({ freshSince: week.start });
        if (songs.length > 0) await snapshots.write(week.key, countsFromLibrary(songs));
      }
    } catch {}
  }

  const recent = await getRecentlyPlayed(50);
  if (recent.length === 0) return;
  const log = await readJson<StreamedLog>(STREAMED_KEY, { lastList: null, entries: {} });
  const ids = recent.map((r) => r.storeId);
  // The first look only sets a baseline: its songs could be from any time.
  if (log.lastList) {
    const before = new Set(log.lastList);
    for (const r of recent) {
      if (before.has(r.storeId)) continue;
      const k = `${week.key}:${r.storeId}`;
      if (!log.entries[k]) log.entries[k] = { ...r, firstSeen: now };
    }
  }
  const oldest = week.start - KEEP_WEEKS * 7 * 24 * 60 * 60 * 1000;
  for (const [k, e] of Object.entries(log.entries)) if (e.firstSeen < oldest) delete log.entries[k];
  log.lastList = ids;
  await writeJson(STREAMED_KEY, log);
}

// ── Photos ─────────────────────────────────────────────────────────────────

/**
 * Camera photos taken in [from, to), oldest first; screenshots and photos
 * already known to be boring left out. `unanalyzed` are the ones not looked
 * at yet (warmAnalyses them, then read again).
 */
export async function cameraPhotosChecked(from: number, to: number): Promise<{ photos: WeekPhoto[]; unanalyzed: string[] }> {
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (perm.status !== "granted") return { photos: [], unanalyzed: [] };
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: from,
      createdBefore: to,
      first: PHOTO_LIMIT,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    });
    const photos = page.assets
      .filter((a) => !(a.mediaSubtypes ?? []).includes("screenshot"))
      .map((a) => ({ id: a.id, uri: a.uri, createdAt: a.creationTime }));
    // Homework, receipts and documents aren't memories: leave them out.
    const { kept, unanalyzed } = await keepInterestingCached(photos);
    return { photos: kept, unanalyzed };
  } catch {
    return { photos: [], unanalyzed: [] };
  }
}

/** Camera photos in [from, to), as cameraPhotosChecked, without the bookkeeping. */
export async function cameraPhotos(from: number, to: number): Promise<WeekPhoto[]> {
  return (await cameraPhotosChecked(from, to)).photos;
}

/** The day's camera photos for create's "Photos from that day". */
export async function photosForDay(day: string): Promise<WeekPhoto[]> {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return cameraPhotos(start, end);
}

/**
 * A file URI create can upload. Downloads the original from iCloud when the
 * phone only keeps an optimized copy, unless `localOnly` (then null).
 */
export async function photoFileUri(photo: WeekPhoto, localOnly = false): Promise<string | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(photo.id, { shouldDownloadFromNetwork: !localOnly });
    return info.localUri ?? null;
  } catch {
    return null;
  }
}

// ── Catalog and saved ──────────────────────────────────────────────────────

/** Catalog songs (artwork, preview, duration) for store ids, in batches. */
export async function lookupCatalog(storeIds: string[]): Promise<Record<string, Song>> {
  const out: Record<string, Song> = {};
  for (let i = 0; i < storeIds.length; i += 50) {
    const batch = storeIds.slice(i, i + 50);
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${batch.join(",")}&entity=song`);
      if (!res.ok) continue;
      const json = await res.json();
      for (const t of (json.results ?? []) as ItunesTrack[]) {
        if (t.trackId && t.trackName) out[String(t.trackId)] = itunesTrackToSong(t);
      }
    } catch {}
  }
  return out;
}

/** The song create should open with, from the catalog or what the phone knows. */
export function songForCreate(
  song: Pick<WeekSong, "storeId" | "title" | "artistName" | "albumTitle" | "artworkUrl">,
  catalog: Record<string, Song>
): Song {
  const found = song.storeId ? catalog[song.storeId] : undefined;
  if (found) return found;
  return {
    id: song.storeId ?? "",
    title: song.title,
    artistName: song.artistName,
    albumName: song.albumTitle,
    artworkUrl: song.artworkUrl ?? "",
    provider: "apple_music",
    appleMusicId: song.storeId,
    spotifyId: null,
    durationMs: 0,
  };
}

/**
 * Songs already made into moments (since `sinceMs` when given): storeId →
 * the newest moment's id.
 */
export async function savedByStoreId(userId: string, storeIds: string[], sinceMs?: number): Promise<Record<string, string>> {
  if (storeIds.length === 0) return {};
  let query = supabase
    .from("moments")
    .select("id, song_apple_music_id, created_at")
    .eq("user_id", userId)
    .in("song_apple_music_id", storeIds);
  if (sinceMs !== undefined) query = query.gte("created_at", new Date(sinceMs).toISOString());
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = row.song_apple_music_id as string | null;
    if (id && !out[id]) out[id] = row.id as string;
  }
  return out;
}

/**
 * Params that open capture with a song filled in, dated when it happened,
 * offering that day's photos ("Last week", On this day, From before).
 */
export function captureParams(
  song: Song,
  at: number,
  day: string,
  source: string,
  /** Offer this span's photos instead of the day's (From before: the week). */
  range?: { from: number; to: number },
  /** The question capture opens with, in place of its usual prompt. */
  question?: string
): Record<string, string> {
  return {
    ...(range ? { photosFrom: String(range.from), photosTo: String(range.to) } : {}),
    ...(question ? { promptQuestion: question } : {}),
    songId: song.id,
    songTitle: song.title,
    songArtist: song.artistName,
    songAlbum: song.albumName,
    songArtwork: song.artworkUrl,
    songProvider: song.provider,
    songAppleMusicId: song.appleMusicId ?? "",
    songSpotifyId: song.spotifyId ?? "",
    songDurationMs: String(song.durationMs),
    photosDay: day,
    momentAt: String(at),
    source,
  };
}

// ── The week ───────────────────────────────────────────────────────────────

export interface LastWeekData {
  week: WeekRange;
  access: LastWeekAccess;
  askDismissed: boolean;
  dismissedWeek: string | null;
  seenWeek: string | null;
  songs: WeekSong[];
  days: WeekDay[];
  photoCount: number;
  hasContent: boolean;
  catalog: Record<string, Song>;
  /** WeekSong.key → moment id, for songs already saved. */
  saved: Record<string, string>;
  /** Photos not looked at yet; useLastWeek analyses them, then refreshWeekPhotos. */
  unanalyzed: string[];
}

export async function loadLastWeek(userId: string, now = Date.now()): Promise<LastWeekData> {
  const week = lastWeekRange(now);
  const [access, askDismissed, dismissedWeek, seenWeek] = await Promise.all([
    lastWeekAccess(),
    readJson<boolean>(ASK_DISMISSED_KEY, false),
    readJson<string | null>(DISMISSED_KEY, null),
    readJson<string | null>(SEEN_KEY, null),
  ]);
  const empty: LastWeekData = {
    week,
    access,
    askDismissed,
    dismissedWeek,
    seenWeek,
    songs: [],
    days: [],
    photoCount: 0,
    hasContent: false,
    catalog: {},
    saved: {},
    unanalyzed: [],
  };
  if (access !== "granted") return empty;

  const [library, checked, countsAtStart, countsAtEnd, log] = await Promise.all([
    getLibrary(),
    cameraPhotosChecked(week.start, Math.min(week.end, now)),
    snapshots.read(week.key),
    // The next week's start is this one's end.
    snapshots.read(dayKey(week.end)),
    readJson<StreamedLog>(STREAMED_KEY, { lastList: null, entries: {} }),
  ]);

  const songs = buildWeekSongs({
    week,
    library,
    streamed: Object.values(log.entries).filter((e) => inWeek(e.firstSeen, week)),
    countsAtStart,
    countsAtEnd,
  });

  const storeIds = [...new Set(songs.map((s) => s.storeId).filter((id): id is string => !!id))];
  const [catalog, savedIds] = await Promise.all([
    lookupCatalog(storeIds),
    savedByStoreId(userId, storeIds, week.start).catch(() => ({}) as Record<string, string>),
  ]);
  const saved: Record<string, string> = {};
  for (const s of songs) if (s.storeId && savedIds[s.storeId]) saved[s.key] = savedIds[s.storeId];

  return {
    ...empty,
    ...weekPhotosView(songs, checked.photos),
    unanalyzed: checked.unanalyzed,
    songs,
    catalog,
    saved,
  };
}

/**
 * After photos were analysed: the same week with photos now known to be
 * boring dropped. Only the photo part changes; the library, catalog and
 * "Saved" lookups aren't repeated.
 */
export async function refreshWeekPhotos(data: LastWeekData): Promise<LastWeekData> {
  const { kept, unanalyzed } = await keepInterestingCached(photosOfDays(data.days));
  return { ...data, ...weekPhotosView(data.songs, kept), unanalyzed };
}

// ── "Last week is ready" (1.4 notification choices) ───────────────────────

/** Whether `week` was dismissed from the Journal. */
export async function isWeekDismissed(week: WeekRange): Promise<boolean> {
  return (await readJson<string | null>(DISMISSED_KEY, null)) === week.key;
}

/**
 * Whether the week in progress already has something to recap: the check
 * behind the Sunday reminder, so it's only sent for a week with real content.
 * Same reading as loadLastWeek, minus the catalog and "Saved" lookups (no
 * network).
 */
export async function weekSoFarHasContent(now = Date.now()): Promise<boolean> {
  if ((await lastWeekAccess()) !== "granted") return false;
  const week = currentWeek(now);
  const [library, checked, countsAtStart, log] = await Promise.all([
    getLibrary(),
    cameraPhotosChecked(week.start, now),
    snapshots.read(week.key),
    readJson<StreamedLog>(STREAMED_KEY, { lastList: null, entries: {} }),
  ]);
  const songs = buildWeekSongs({
    week,
    library,
    streamed: Object.values(log.entries).filter((e) => inWeek(e.firstSeen, week)),
    countsAtStart,
    countsAtEnd: null,
  });
  return weekHasContent(songs.length, checked.photos.length);
}
