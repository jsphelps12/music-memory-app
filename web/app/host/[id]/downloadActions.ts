"use server";

import { photoFileName } from "@/lib/occasionDownloads";
import { allEntries, signPhotos } from "@/lib/occasionHostData";
import { getHostSupabase } from "@/lib/supabase/server";
import type { ZipPhoto } from "./Downloads";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Freshly signed URLs for every photo the zip should hold, asked for when the
 * couple taps download (the page's own URLs expire an hour after it loads).
 * Runs as the signed-in host, so RLS decides what comes back: another
 * occasion's id returns nothing. `missing` counts photos that wouldn't sign.
 */
export async function photosForZip(occasionId: string): Promise<{ photos: ZipPhoto[]; missing: number }> {
  if (!UUID.test(occasionId)) return { photos: [], missing: 0 };
  const supabase = await getHostSupabase();
  const rows = (await allEntries(supabase, occasionId, { visibleOnly: true })).filter((r) => r.photo_source);
  const { photoUrl } = await signPhotos(supabase, rows);
  const photos: ZipPhoto[] = [];
  for (const r of rows) {
    const url = photoUrl(r);
    if (url) photos.push({ url, name: "" });
  }
  // Names use the final positions, so the numbering has no gaps.
  let i = 0;
  for (const r of rows) {
    const url = photoUrl(r);
    if (!url) continue;
    photos[i].name = photoFileName(i + 1, photos.length, r.guest_name, r.song_title, url);
    i += 1;
  }
  return { photos, missing: rows.length - photos.length };
}
