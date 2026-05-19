import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import type { Moment } from "@/types";

export interface BrowseMeta {
  id: string;
  mood: string | null;
  people: string[];
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  songArtworkUrl: string;
}

export async function fetchBrowseMetadata(userId: string): Promise<BrowseMeta[]> {
  const { data, error } = await supabase
    .from("moments")
    .select("id, mood, people, moment_date, song_title, song_artist, song_artwork_url")
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
    songArtworkUrl: r.song_artwork_url ?? "",
  }));
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
    .select("*")
    .eq("user_id", userId)
    .eq("mood", mood)
    .order("moment_date", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}
