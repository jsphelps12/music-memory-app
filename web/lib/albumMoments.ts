import type { SupabaseClient } from "@supabase/supabase-js";
import type { MomentItem } from "../components/AlbumMomentList";

// One query and one mapping for every web page that lists an album's moments
// (/c/[invite_code], its contribute hub, and the hub's polling route), so the
// columns, contributor names and photo URLs can't drift between them.
//
// Relative imports on purpose: the root Vitest run maps "@/" to the app's
// root, not to web/.

const ALBUM_MOMENT_SELECT = `
  added_at,
  added_by_user_id,
  moments(
    id,
    song_title,
    song_artist,
    song_artwork_url,
    song_preview_url,
    photo_urls,
    reflection_text,
    moment_date,
    mood,
    guest_name,
    guest_uuid
  )
`;

export interface AlbumMomentRow {
  added_at: string;
  added_by_user_id: string | null;
  moments: {
    id: string;
    song_title: string;
    song_artist: string;
    song_artwork_url: string | null;
    song_preview_url: string | null;
    photo_urls: string[] | null;
    reflection_text: string | null;
    moment_date: string | null;
    mood: string | null;
    guest_name: string | null;
    guest_uuid: string | null;
  } | null;
}

export interface FetchAlbumMomentsOptions {
  /** "asc" reads like a tracklist (album page); "desc" puts the newest first. */
  order: "asc" | "desc";
  /** Only rows added strictly after this ISO timestamp (polling). */
  after?: string | null;
  /** Name shown when a member contributor's profile can't be found. */
  fallbackContributorName?: string | null;
}

export interface AlbumMoments {
  moments: MomentItem[];
  /** added_at of the newest row returned, for the next poll's `after`. */
  latestAddedAt: string | null;
}

export function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/moment-photos/${path}`;
}

/** Signed-in contributors whose names come from profiles (guests carry their own). */
export function memberContributorIds(rows: AlbumMomentRow[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.added_by_user_id && !r.moments?.guest_uuid) ids.add(r.added_by_user_id);
  }
  return [...ids];
}

export function mapAlbumMomentRows(
  rows: AlbumMomentRow[],
  profileNames: Map<string, string | null>,
  supabaseUrl: string,
  fallbackContributorName: string | null = null
): MomentItem[] {
  const items: MomentItem[] = [];
  for (const r of rows) {
    const m = r.moments;
    if (!m) continue;
    const contributorName =
      m.guest_uuid && m.guest_name
        ? m.guest_name
        : ((r.added_by_user_id ? profileNames.get(r.added_by_user_id) : null) ?? fallbackContributorName);
    items.push({
      id: m.id,
      songTitle: m.song_title,
      songArtist: m.song_artist,
      artworkUrl: m.song_artwork_url,
      previewUrl: m.song_preview_url,
      photoUrls: (m.photo_urls ?? []).map((path) => publicPhotoUrl(supabaseUrl, path)),
      reflection: m.reflection_text,
      momentDate: m.moment_date,
      mood: m.mood,
      contributorName,
    });
  }
  return items;
}

/** Rows arrive sorted by added_at, so the newest is at one end. */
export function latestAddedAt(rows: AlbumMomentRow[], order: "asc" | "desc"): string | null {
  const newest = order === "desc" ? rows[0] : rows[rows.length - 1];
  return newest?.added_at ?? null;
}

/**
 * Throws on any query error rather than returning an empty album, so a failed
 * read shows as an error instead of "No songs yet".
 */
export async function fetchAlbumMomentItems(
  supabase: SupabaseClient,
  collectionId: string,
  { order, after, fallbackContributorName = null }: FetchAlbumMomentsOptions
): Promise<AlbumMoments> {
  let query = supabase
    .from("collection_moments")
    .select(ALBUM_MOMENT_SELECT)
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: order === "asc" });
  if (after) query = query.gt("added_at", after);

  const { data, error } = await query.overrideTypes<AlbumMomentRow[], { merge: false }>();
  if (error) throw new Error(`album moments: ${error.message}`);
  const rows = data ?? [];

  const ids = memberContributorIds(rows);
  const profileNames = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profiles, error: profileError } = await supabase.rpc("get_public_profiles", { p_ids: ids });
    if (profileError) throw new Error(`album contributors: ${profileError.message}`);
    for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      profileNames.set(p.id, p.display_name);
    }
  }

  return {
    moments: mapAlbumMomentRows(rows, profileNames, process.env.NEXT_PUBLIC_SUPABASE_URL!, fallbackContributorName),
    latestAddedAt: latestAddedAt(rows, order),
  };
}
