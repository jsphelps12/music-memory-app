import { notFound, redirect } from "next/navigation";
import { momentWhen, momentLink } from "@/lib/occasionBook";
import { bookLink } from "@/lib/occasionHost";
import { allEntries, signPhotos } from "@/lib/occasionHostData";
import { formatEventDate } from "@/lib/occasionGuest";
import type { PrintMoment } from "@/lib/occasionPrint";
import { momentSig } from "@/lib/occasionShare";
import { getHostSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Occasion = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  time_zone: string;
  status: string;
  slug: string;
  book_token: string;
  share_book_with_guests: boolean;
};

/**
 * Everything a proof prints, as the signed-in host: the visible moments in
 * the order the night went, and where its codes lead. Codes reach guests
 * (the keepsake, each moment's own page) only once the book is out and
 * shared; before that the print's code opens the couple's own preview.
 */
export async function loadPrint(id: string, { photos = false } = {}) {
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, rows] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, time_zone, status, slug, book_token, share_book_with_guests")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    allEntries(supabase, id, { visibleOnly: true }),
  ]);
  if (error) throw error;
  if (!occasion) notFound();
  if (occasion.status === "draft") redirect(`/host/${id}`);

  const photoUrl = photos ? (await signPhotos(supabase, rows)).photoUrl : () => null;
  const moments: PrintMoment[] = rows.map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    title: r.song_title,
    artist: r.song_artist,
    words: r.words,
    photoUrl: photoUrl(r),
    artworkUrl: r.song_artwork_url,
    when: momentWhen(r.created_at, occasion.event_date, occasion.time_zone),
  }));
  const sharing = occasion.status === "revealed" && occasion.share_book_with_guests;
  return {
    occasion: {
      id: occasion.id,
      names: occasion.names,
      when: [formatEventDate(occasion.event_date), occasion.city].filter(Boolean).join(" · "),
    },
    moments,
    sharing,
    playUrl: sharing ? bookLink(occasion.slug, occasion.book_token) : `https://soundtracks.app/host/${occasion.id}/book`,
    momentUrl: (m: PrintMoment) =>
      sharing ? momentLink(occasion.slug, m.id, momentSig(occasion.book_token, m.id)) : null,
  };
}
