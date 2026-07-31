import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import type { Moment } from "@/types";

// Versioned, like timeline_cache_v1_ / profile_cache_v1_. What lands here is
// JSON.parsed straight into BrowseMeta[] and handed to queryClient.setQueryData,
// so a shape change would feed stale-shaped objects to five screens with nothing
// to notice. Bump the suffix whenever BrowseMeta changes and add the old prefix
// to BROWSE_CACHE_PREFIXES_TO_CLEAR below.
const BROWSE_CACHE_PREFIX = "browse_meta_v2_"; // v2: mood → moods (multi-mood)

// Every prefix this module has ever written, cleared together on sign-out and
// account deletion — bumping a version orphans the old key otherwise, leaving a
// full copy of the user's browse metadata on disk forever.
const BROWSE_CACHE_PREFIXES_TO_CLEAR = [BROWSE_CACHE_PREFIX, "browse_meta_v1_", "browse_meta_"];

const browseCacheKey = (userId: string) => `${BROWSE_CACHE_PREFIX}${userId}`;

// Cheap structural check, not validation: the version prefix protects against
// shapes we know changed, this catches a truncated or hand-edited payload. On
// mismatch we return null so the caller falls through to the network.
const BROWSE_META_KEYS: (keyof BrowseMeta)[] = [
  "id",
  "moods",
  "people",
  "momentDate",
  "songTitle",
  "songArtist",
  "songAlbumName",
  "songArtworkUrl",
];

function isBrowseMetaArray(value: unknown): value is BrowseMeta[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true; // a user with no moments caches []
  const first: unknown = value[0];
  if (typeof first !== "object" || first === null) return false;
  return BROWSE_META_KEYS.every((key) => key in first);
}

export async function readBrowseCache(userId: string): Promise<BrowseMeta[] | null> {
  try {
    const raw = await AsyncStorage.getItem(browseCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBrowseMetaArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeBrowseCache(userId: string, data: BrowseMeta[]): Promise<void> {
  try {
    await AsyncStorage.setItem(browseCacheKey(userId), JSON.stringify(data));
  } catch {}
}

export async function clearBrowseCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove(BROWSE_CACHE_PREFIXES_TO_CLEAR.map((p) => `${p}${userId}`));
  } catch {}
}

export interface BrowseMeta {
  id: string;
  moods: string[];
  people: string[];
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  songAlbumName: string;
  songArtworkUrl: string;
}

export async function fetchBrowseMetadata(userId: string): Promise<BrowseMeta[]> {
  const { data, error } = await supabase
    .from("moments")
    .select("id, mood, moods, people, moment_date, song_title, song_artist, song_album_name, song_artwork_url")
    .eq("user_id", userId)
    .order("moment_date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    // Dual-read: single-mood rows from binaries <= build 22 wrap into an array.
    moods: r.moods ?? (r.mood ? [r.mood] : []),
    people: r.people ?? [],
    momentDate: r.moment_date ?? null,
    songTitle: r.song_title ?? "",
    songArtist: r.song_artist ?? "",
    songAlbumName: r.song_album_name ?? "",
    songArtworkUrl: r.song_artwork_url ?? "",
  }));
}

export async function fetchPersonMoments(userId: string, personName: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .contains("people", [personName])
    .order("moment_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

export async function fetchYearMoments(userId: string, year: number): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .gte("moment_date", `${year}-01-01`)
    .lte("moment_date", `${year}-12-31`)
    .order("moment_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

export async function fetchMoodMoments(userId: string, mood: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    // Match either representation: moods array containment for rows written by
    // multi-mood clients, the legacy mood column for rows binaries <= build 22
    // wrote after the backfill. Mood values are [a-z0-9_] so the raw PostgREST
    // or-syntax needs no escaping.
    .or(`moods.cs.{${mood}},mood.eq.${mood}`)
    .order("moment_date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

export async function fetchSongMoments(userId: string, title: string, artist: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("song_title", title)
    .eq("song_artist", artist)
    .order("moment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

export async function fetchAlbumMoments(userId: string, album: string, artist: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("song_album_name", album)
    .eq("song_artist", artist)
    .order("moment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

export async function fetchArtistMoments(userId: string, artist: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("song_artist", artist)
    .order("moment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}
