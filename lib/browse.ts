import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import type { Moment } from "@/types";

const browseCacheKey = (userId: string) => `browse_meta_${userId}`;

export async function readBrowseCache(userId: string): Promise<BrowseMeta[] | null> {
  try {
    const raw = await AsyncStorage.getItem(browseCacheKey(userId));
    return raw ? (JSON.parse(raw) as BrowseMeta[]) : null;
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
    await AsyncStorage.removeItem(browseCacheKey(userId));
  } catch {}
}

export interface BrowseMeta {
  id: string;
  mood: string | null;
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
    .select("id, mood, people, moment_date, song_title, song_artist, song_album_name, song_artwork_url")
    .eq("user_id", userId)
    .order("moment_date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    mood: r.mood ?? null,
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

export async function fetchCalendarMonth(
  userId: string,
  year: number,
  month: number // 1-based
): Promise<string[]> {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const { data, error } = await supabase
    .from("moments")
    .select("moment_date")
    .eq("user_id", userId)
    .gte("moment_date", `${year}-${mm}-01`)
    .lte("moment_date", `${year}-${mm}-${lastDay}`);

  if (error) throw error;
  const dates = new Set<string>();
  for (const r of data ?? []) {
    if (r.moment_date) dates.add(r.moment_date);
  }
  return Array.from(dates);
}

export async function fetchMoodMoments(userId: string, mood: string): Promise<Moment[]> {
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .eq("mood", mood)
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
