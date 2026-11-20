import { cache } from "react";
import { getSupabase } from "@/lib/supabase";
import { artworkAt } from "@/lib/occasionBook";

/**
 * What a link opens, from get_shared_moment. The RPC reads through
 * moment_view_for(), so a link never carries the place, the people or the
 * share token: only the song, the words, the photos, the date and the mood,
 * plus the sender's display name. Keep it that way: this page reads nothing
 * else.
 */
interface SharedMomentRow {
  song_title: string | null;
  song_artist: string | null;
  song_artwork_url: string | null;
  song_preview_url: string | null;
  reflection_text: string | null;
  photo_urls: string[] | null;
  moment_date: string | null;
  mood: string | null;
  sender_name: string | null;
}

export interface SharedMoment {
  title: string;
  artist: string | null;
  /** Apple's artwork template at a given square size, or null without art. */
  artwork: ((px: number) => string) | null;
  previewUrl: string | null;
  words: string | null;
  photos: string[];
  date: string | null;
  mood: string | null;
  /** Null when the sender has no display name; the page then has no byline. */
  sender: string | null;
}

// Share tokens are uuids. Anything else can't match, so skip the round trip
// (the RPC would return null for it too).
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One moment by its link token, or null for every refusal (malformed,
 * unknown, revoked). The page treats all of those the same, so nothing tells
 * a visitor whether a token ever existed. A failed request throws instead, so
 * an outage shows the retry page rather than "this link doesn't work".
 *
 * cache(): generateMetadata and the page share one call per request.
 */
export const fetchSharedMoment = cache(async (token: string): Promise<SharedMoment | null> => {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await getSupabase().rpc("get_shared_moment", { p_token: token });
  if (error) throw new Error(`get_shared_moment: ${error.message}`);
  const row = data as SharedMomentRow | null;
  if (!row) return null;

  const art = row.song_artwork_url;
  return {
    title: row.song_title?.trim() || "Untitled",
    artist: row.song_artist?.trim() || null,
    artwork: art ? (px: number) => artworkAt(art, px) ?? art : null,
    previewUrl: row.song_preview_url || null,
    words: row.reflection_text?.trim() || null,
    photos: (row.photo_urls ?? []).filter(Boolean).map(photoUrl),
    date: row.moment_date,
    mood: row.mood,
    sender: row.sender_name?.trim() || null,
  };
});

// Rows store bucket paths ({user_id}/…); read them as stored, never rebuild.
// Very old rows may already hold a full URL.
function photoUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/moment-photos/${path}`;
}
