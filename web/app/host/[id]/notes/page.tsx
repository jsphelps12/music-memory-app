import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { keepsakeView, type BookMoment } from "@/lib/occasionBook";
import { allEntries } from "@/lib/occasionHostData";
import { getHostSupabase } from "@/lib/supabase/server";
import { PrintButton } from "../HostActions";
import n from "./notes.module.css";

export const metadata: Metadata = { title: "Your guest book, in words" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Occasion = { id: string; names: string; event_date: string; city: string | null; time_zone: string; status: string };

/**
 * Every moment as liner notes on paper: the song, the guest's words and
 * name, in the order the night went. Printed from the browser, so "Save as
 * PDF" is the download (the same as the table cards; no PDF library).
 * Hidden moments are left out, as in the keepsake.
 */
export default async function GuestBookNotes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, rows] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, time_zone, status")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    allEntries(supabase, id, { visibleOnly: true }),
  ]);
  if (error) throw error;
  if (!occasion) notFound();
  if (occasion.status === "draft") redirect(`/host/${id}`);

  const moments: BookMoment[] = rows.map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    words: r.words,
    appleMusicId: r.song_apple_id,
    title: r.song_title,
    artist: r.song_artist,
    album: r.song_album,
    artworkUrl: r.song_artwork_url,
    previewUrl: null,
    photoUrl: null,
    createdAt: r.created_at,
  }));
  const view = keepsakeView({
    occasion: { names: occasion.names, eventDate: occasion.event_date, city: occasion.city, timeZone: occasion.time_zone },
    moments,
  });

  return (
    <main className={n.page}>
      <div className={n.toolbar}>
        <Link href={`/host/${occasion.id}`}>Back</Link>
        <p>Print it, or choose &ldquo;Save as PDF&rdquo; to keep a copy.</p>
        <PrintButton />
      </div>
      <article className={n.sheet}>
        <header className={n.head}>
          <h1 className={n.names}>{view.names}</h1>
          <p className={n.meta}>
            {view.when}
            {moments.length ? ` · ${view.summary}` : ""}
          </p>
        </header>
        {moments.length ? (
          <ol className={n.list}>
            {view.moments.map((m, i) => (
              <li key={m.id} className={n.item}>
                <span className={n.no}>{i + 1}</span>
                <div>
                  <p className={n.song}>
                    <strong>{m.title}</strong> <span>{m.artist}</span>
                  </p>
                  {m.words ? <p className={n.words}>{m.words}</p> : null}
                  <p className={n.by}>
                    {m.guestName} · {m.when}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={n.meta}>No moments yet.</p>
        )}
      </article>
    </main>
  );
}
