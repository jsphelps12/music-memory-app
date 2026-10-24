import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Keepsake } from "@/components/Keepsake";
import { keepsakeView, type BookMoment } from "@/lib/occasionBook";
import { allEntries, signPhotos } from "@/lib/occasionHostData";
import { getHostSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your guest book" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Occasion = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  time_zone: string;
  status: "draft" | "collecting" | "curating" | "revealed";
  share_book_with_guests: boolean;
};

/**
 * The keepsake as the couple sees it, from their own session: a preview
 * before the reveal, and always open to them (even "Just us"). Hidden
 * moments are left out, exactly as guests will get it.
 */
export default async function HostKeepsake({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, rows] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, time_zone, status, share_book_with_guests")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    allEntries(supabase, id, { visibleOnly: true }),
  ]);
  if (error) throw error;
  if (!occasion) notFound();
  if (occasion.status === "draft") redirect(`/host/${id}`);

  const { photoUrl } = await signPhotos(supabase, rows);
  const moments: BookMoment[] = rows.map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    words: r.words,
    appleMusicId: r.song_apple_id,
    title: r.song_title,
    artist: r.song_artist,
    album: r.song_album,
    artworkUrl: r.song_artwork_url,
    previewUrl: r.song_preview_url,
    photoUrl: photoUrl(r),
    createdAt: r.created_at,
  }));
  const view = keepsakeView({
    occasion: { names: occasion.names, eventDate: occasion.event_date, city: occasion.city, timeZone: occasion.time_zone },
    moments,
  });
  const note =
    occasion.status !== "revealed"
      ? "A preview. Guests can't open this until you reveal it."
      : occasion.share_book_with_guests
        ? "This is what your guests see."
        : "Just us: only the two of you can open this.";

  return <Keepsake {...view} preview={{ note, backHref: `/host/${id}` }} />;
}
