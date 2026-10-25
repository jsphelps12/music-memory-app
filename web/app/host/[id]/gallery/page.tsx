import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { entryTimeLabel } from "@/lib/occasionHost";
import { allEntries, allGallery, galleryThumbPath, signPaths } from "@/lib/occasionHostData";
import { getHostSupabase } from "@/lib/supabase/server";
import { GalleryManager, type GalleryEntry, type GalleryPhoto } from "./GalleryManager";

export const metadata: Metadata = { title: "Your photographer's photos" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Occasion = { id: string; names: string; event_date: string; time_zone: string; status: string };

/**
 * Gallery fill (docs/OCCASIONS.md, flow 4): the photographer's photos, and
 * a suggested one for each song-only moment from the night. Everything here
 * is the couple's choice; nothing is filled on its own.
 */
export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, gallery, entries] = await Promise.all([
    supabase.from("occasions").select("id, names, event_date, time_zone, status").eq("id", id).maybeSingle<Occasion>(),
    allGallery(supabase, id),
    // Hidden ones too: a photo filling a hidden moment is still in use.
    allEntries(supabase, id),
  ]);
  if (error) throw error;
  if (!occasion) notFound();
  if (occasion.status === "draft") redirect(`/host/${id}`);

  // Grids load the small copies; the full photos are for the keepsake.
  const thumbs = await signPaths(supabase, gallery.map((g) => galleryThumbPath(g.path)));
  const photos: GalleryPhoto[] = gallery.map((g) => ({
    id: g.id,
    path: g.path,
    takenAt: g.taken_at,
    thumbUrl: thumbs.get(galleryThumbPath(g.path)) ?? null,
  }));
  const toEntry = (r: (typeof entries)[number]): GalleryEntry => ({
    id: r.id,
    guestName: r.guest_name,
    title: r.song_title,
    artist: r.song_artist,
    artworkUrl: r.song_artwork_url,
    createdAt: r.created_at,
    when: entryTimeLabel(r.created_at, occasion.time_zone),
    galleryPhotoId: r.photo_source === "gallery" ? r.gallery_photo_id : null,
  });
  const visible = entries.filter((r) => !r.hidden);
  const songOnly = visible.filter((r) => !r.photo_source).map(toEntry);
  const filled = visible.filter((r) => r.photo_source === "gallery").map(toEntry);
  const usedByHidden = entries.filter((r) => r.hidden && r.gallery_photo_id).map((r) => r.gallery_photo_id!);

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <Link href={`/host/${occasion.id}`} className={s.quietButton}>
            {occasion.names}
          </Link>
        </TopBar>
        <h1 className={s.headline}>Your photographer&rsquo;s photos</h1>
        <p className={`${s.body} ${s.lede}`}>
          Add the gallery from your photographer. Every song-only moment from the night gets a suggested photo, taken
          around when that guest picked their song. You choose which to keep.
        </p>
        <GalleryManager
          occasionId={occasion.id}
          eventDate={occasion.event_date}
          timeZone={occasion.time_zone}
          photos={photos}
          songOnly={songOnly}
          filled={filled}
          usedByHidden={usedByHidden}
        />
      </div>
    </main>
  );
}
