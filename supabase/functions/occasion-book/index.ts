import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bookMoment,
  canOpenBook,
  chunks,
  isBookToken,
  photoPathFor,
  type BookEntryRow,
  type BookOccasion,
} from "../_shared/occasionBook.ts";
import { cleanSlug } from "../_shared/occasionEntry.ts";

// The keepsake for guests (docs/OCCASIONS.md, the keepsake page). The page
// at /for/{slug}/book?k={token} is server-rendered and posts here; nobody
// has a session (verify_jwt = false). The token is the key: 122 random
// bits, checked in constant time, and only once the couple has revealed the
// book and left it shared ("Just us" off). Photos stay in the private
// bucket; the response carries short-lived signed URLs.
//
//   POST { slug, token } → { occasion: {...}, moments: [...] }  (oldest first)
//                        → 404 for every refusal, alike.

const BUCKET = "occasion-photos";
const PHOTO_URL_SECONDS = 6 * 60 * 60;
const PAGE = 1000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const notFound = () => json(404, { error: "This link doesn't open a guest book." });

async function visibleEntries(admin: SupabaseClient, occasionId: string): Promise<BookEntryRow[]> {
  const rows: BookEntryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("occasion_entries")
      .select(
        "id, guest_name, words, song_apple_id, song_title, song_artist, song_album, song_artwork_url, song_preview_url, photo_source, photo_path, gallery_photo_id, created_at"
      )
      .eq("occasion_id", occasionId)
      .eq("hidden", false)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as BookEntryRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function signedUrls(admin: SupabaseClient, rows: BookEntryRow[]) {
  const galleryIds = [...new Set(rows.flatMap((r) => (r.photo_source === "gallery" && r.gallery_photo_id ? [r.gallery_photo_id] : [])))];
  const galleryPaths = new Map<string, string>();
  for (const ids of chunks(galleryIds, 100)) {
    const { data, error } = await admin.from("occasion_gallery_photos").select("id, path").in("id", ids);
    if (error) throw error;
    for (const g of data ?? []) galleryPaths.set(g.id, g.path);
  }
  const paths = [...new Set(rows.map((r) => photoPathFor(r, galleryPaths)).filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  for (const batch of chunks(paths, 500)) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(batch, PHOTO_URL_SECONDS);
    // A photo that won't sign leaves its moment song-only rather than
    // failing the whole book.
    if (error) console.error("[occasion-book] signing failed:", error.message);
    for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return (r: BookEntryRow) => {
    const path = photoPathFor(r, galleryPaths);
    return path ? urls.get(path) ?? null : null;
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const body = (await req.json().catch(() => null)) as { slug?: unknown; token?: unknown } | null;
    const slug = cleanSlug(body?.slug);
    const token = body?.token;
    if (!slug || !isBookToken(token)) return notFound();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: occasion, error } = await admin
      .from("occasions")
      .select("id, names, event_date, city, time_zone, status, share_book_with_guests, book_token")
      .eq("slug", slug)
      .maybeSingle<BookOccasion>();
    if (error) throw error;
    if (!occasion || !canOpenBook(occasion, token)) return notFound();

    const rows = await visibleEntries(admin, occasion.id);
    const photoUrl = await signedUrls(admin, rows);
    return json(200, {
      occasion: {
        names: occasion.names,
        eventDate: occasion.event_date,
        city: occasion.city,
        timeZone: occasion.time_zone,
      },
      moments: rows.map((r) => bookMoment(r, photoUrl(r))),
    });
  } catch (e) {
    console.error("[occasion-book] failed:", (e as Error)?.message ?? e);
    return json(500, { error: "The guest book didn't load. Try again in a moment." });
  }
});
