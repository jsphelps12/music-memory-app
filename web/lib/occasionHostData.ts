import type { getHostSupabase } from "@/lib/supabase/server";

// Reading an occasion's entries as the signed-in host (RLS and column grants
// decide what's visible): the dashboard and the keepsake preview.

type Supabase = Awaited<ReturnType<typeof getHostSupabase>>;

// PostgREST returns at most 1000 rows per request; a big wedding has more.
const PAGE = 1000;
const PHOTO_URL_SECONDS = 60 * 60;

export const ENTRY_COLUMNS =
  "id, guest_name, words, song_apple_id, song_title, song_artist, song_album, song_artwork_url, song_preview_url, photo_source, photo_path, gallery_photo_id, hidden, created_at";

export type EntryRow = {
  id: string;
  guest_name: string;
  words: string | null;
  song_apple_id: string;
  song_title: string;
  song_artist: string;
  song_album: string | null;
  song_artwork_url: string | null;
  song_preview_url: string | null;
  photo_source: "guest" | "gallery" | null;
  photo_path: string | null;
  gallery_photo_id: string | null;
  hidden: boolean;
  created_at: string;
};

/** Every entry, a page at a time. */
export async function allEntries(
  supabase: Supabase,
  occasionId: string,
  { newestFirst = false, visibleOnly = false } = {}
): Promise<EntryRow[]> {
  const rows: EntryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from("occasion_entries").select(ENTRY_COLUMNS).eq("occasion_id", occasionId);
    if (visibleOnly) query = query.eq("hidden", false);
    const { data, error } = await query
      .order("created_at", { ascending: !newestFirst })
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<EntryRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Photos are private: each gets a short-lived signed URL, made in batches.
 * A storage hiccup shouldn't take the whole page down, so the caller gets
 * the moments without those photos and a flag to say so.
 */
export async function signPhotos(
  supabase: Supabase,
  rows: EntryRow[]
): Promise<{ photoUrl: (row: EntryRow) => string | null; photosMissing: boolean }> {
  let photosMissing = false;
  const galleryIds = [
    ...new Set(rows.flatMap((r) => (r.photo_source === "gallery" && r.gallery_photo_id ? [r.gallery_photo_id] : []))),
  ];
  const galleryPaths = new Map<string, string>();
  // Kept short: the ids go in the request URL.
  for (const ids of chunks(galleryIds, 100)) {
    const { data, error } = await supabase.from("occasion_gallery_photos").select("id, path").in("id", ids);
    if (error) photosMissing = true;
    for (const g of data ?? []) galleryPaths.set(g.id, g.path);
  }
  const pathFor = (r: EntryRow) =>
    r.photo_source === "guest" ? r.photo_path : r.photo_source === "gallery" ? galleryPaths.get(r.gallery_photo_id ?? "") ?? null : null;
  const paths = [...new Set(rows.map(pathFor).filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  for (const batch of chunks(paths, 500)) {
    const { data, error } = await supabase.storage.from("occasion-photos").createSignedUrls(batch, PHOTO_URL_SECONDS);
    if (error) photosMissing = true;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
      else photosMissing = true;
    }
  }
  return {
    photoUrl: (r) => {
      const path = pathFor(r);
      return path ? urls.get(path) ?? null : null;
    },
    photosMissing,
  };
}
