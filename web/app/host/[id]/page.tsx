import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { entryTimeLabel, groupChatMessages, guestLink, lastDayLabel } from "@/lib/occasionHost";
import { formatEventDate } from "@/lib/occasionGuest";
import { getHostSupabase } from "@/lib/supabase/server";
import h from "../host.module.css";
import { ActivateButton, AutoRefresh, CloseCollecting, CopyButton, JustUsSwitch } from "./HostActions";
import { Moments, type Moment } from "./Moments";

export const metadata: Metadata = { title: "Your wedding" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_URL_SECONDS = 60 * 60;
// PostgREST returns at most 1000 rows per request; a big wedding has more.
const PAGE = 1000;
const ENTRY_COLUMNS =
  "id, guest_name, words, song_title, song_artist, song_artwork_url, photo_source, photo_path, gallery_photo_id, hidden, created_at";

type Occasion = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  slug: string;
  status: "draft" | "collecting" | "curating" | "revealed";
  collect_closes_at: string | null;
  time_zone: string;
  share_book_with_guests: boolean;
};

type Supabase = Awaited<ReturnType<typeof getHostSupabase>>;

type EntryRow = {
  id: string;
  guest_name: string;
  words: string | null;
  song_title: string;
  song_artist: string;
  song_artwork_url: string | null;
  photo_source: "guest" | "gallery" | null;
  photo_path: string | null;
  gallery_photo_id: string | null;
  hidden: boolean;
  created_at: string;
};

export default async function OccasionDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, entries] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, slug, status, collect_closes_at, time_zone, share_book_with_guests")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    allEntries(supabase, id),
  ]);
  if (error) throw error;
  if (!occasion) notFound();

  const { moments, photosMissing } = await withPhotoUrls(supabase, entries, occasion.time_zone);
  const visible = entries.filter((e) => !e.hidden).length;
  const phase = phaseOf(occasion);
  const link = guestLink(occasion.slug);
  const when = [formatEventDate(occasion.event_date), occasion.city].filter(Boolean).join(" · ");
  const lastDay = occasion.collect_closes_at ? lastDayLabel(occasion.collect_closes_at, occasion.time_zone) : null;
  const messages = groupChatMessages(link);

  return (
    <main className={s.page}>
      {phase === "open" ? <AutoRefresh occasionId={occasion.id} known={entries.length} /> : null}
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <Link href="/host" className={s.quietButton}>
            Your weddings
          </Link>
        </TopBar>
        <h1 className={s.headline}>{occasion.names}</h1>
        <p className={`${s.meta} ${s.lede}`}>{when}</p>

        {occasion.status === "draft" ? (
          <section className={h.panel} aria-labelledby="open-title">
            <h2 id="open-title" className={s.title}>
              Open your guest book
            </h2>
            <p className={s.body}>
              $79 opens it. Guests can add songs from now until two weeks after your wedding, and you keep everything
              they leave.
            </p>
            <p className={s.meta}>Your link will be {link}</p>
            {process.env.NEXT_PUBLIC_DEV_PAYMENTS === "true" ? (
              <ActivateButton occasionId={occasion.id} />
            ) : (
              <p className={s.body}>Checkout opens soon. We&rsquo;ll email you when it does.</p>
            )}
            <Link className={s.textLink} href={`/host/${occasion.id}/edit`}>
              Edit details
            </Link>
          </section>
        ) : (
          <>
            <p className={`${s.body} ${h.after}`} aria-live="polite">
              {statusLine(phase, visible, lastDay)}
            </p>

            <section className={h.section} aria-labelledby="moments-title">
              <h2 id="moments-title" className={s.title}>
                Moments
              </h2>
              {photosMissing ? <p className={s.meta}>Some photos didn&rsquo;t load. Refresh to try again.</p> : null}
              <Moments moments={moments} />
            </section>

            <section className={h.section} aria-labelledby="share-title">
              <h2 id="share-title" className={s.title}>
                Share it
              </h2>
              <div className={h.panel}>
                <p className={h.link}>{link}</p>
                <div className={h.actions}>
                  <CopyButton text={link} />
                  <a className={s.textLink} href={`/for/${occasion.slug}`} target="_blank" rel="noopener">
                    Open the guest page
                  </a>
                </div>
                <div className={h.qr} dangerouslySetInnerHTML={{ __html: await qrSvg(link) }} />
                <Link className={`${s.button} ${h.inline}`} href={`/host/${occasion.id}/cards`}>
                  Print table cards
                </Link>
              </div>
              {phase === "open" ? (
                <div className={h.messages}>
                  <Message label="For the group chat now" text={messages.ask} />
                  <Message label="The week after: the photo reminder" text={messages.photoReminder} />
                </div>
              ) : null}
            </section>

            <section className={h.section} aria-labelledby="settings-title">
              <h2 id="settings-title" className={s.title}>
                Settings
              </h2>
              <JustUsSwitch occasionId={occasion.id} initial={occasion.share_book_with_guests} />
              <Link className={s.textLink} href={`/host/${occasion.id}/edit`}>
                Edit names, date and suggested songs
              </Link>
              {phase === "open" ? <CloseCollecting occasionId={occasion.id} /> : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

type Phase = "draft" | "open" | "closed" | "revealed";

/**
 * Where the guest book really is. A collecting book whose close has passed is
 * closed: guests are already turned away by time, and nothing flips its
 * status until the scheduled close lands (P1.6).
 */
function phaseOf(o: Occasion): Phase {
  if (o.status === "draft" || o.status === "revealed") return o.status;
  if (o.status === "curating") return "closed";
  return o.collect_closes_at && Date.parse(o.collect_closes_at) <= Date.now() ? "closed" : "open";
}

function statusLine(phase: Phase, visible: number, lastDay: string | null): string {
  const count = visible === 1 ? "1 moment" : `${visible} moments`;
  if (phase === "open") return `${count} so far.${lastDay ? ` Guests can add songs through ${lastDay}.` : ""}`;
  if (phase === "closed") return `${count}. Your guest book is closed; look it over and hide anything you'd rather not keep.`;
  return `${count}. Your guest book is out.`;
}

function Message({ label, text }: { label: string; text: string }) {
  return (
    <div className={h.message}>
      <p className={s.label}>{label}</p>
      <p className={h.messageText}>{text}</p>
      <CopyButton text={text} label="Copy message" />
    </div>
  );
}

/** Every entry, newest first, a page at a time. */
async function allEntries(supabase: Supabase, occasionId: string): Promise<EntryRow[]> {
  const rows: EntryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("occasion_entries")
      .select(ENTRY_COLUMNS)
      .eq("occasion_id", occasionId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<EntryRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Photos are private: each gets a short-lived signed URL, made in batches.
 * A storage hiccup shouldn't take the whole page down, so it shows the
 * moments without those photos and says so.
 */
async function withPhotoUrls(
  supabase: Supabase,
  rows: EntryRow[],
  timeZone: string
): Promise<{ moments: Moment[]; photosMissing: boolean }> {
  let photosMissing = false;
  const galleryIds = [
    ...new Set(rows.filter((r) => r.photo_source === "gallery" && r.gallery_photo_id).map((r) => r.gallery_photo_id!)),
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
  const moments = rows.map((r) => {
    const path = pathFor(r);
    return {
      id: r.id,
      guestName: r.guest_name,
      words: r.words,
      title: r.song_title,
      artist: r.song_artist,
      artworkUrl: r.song_artwork_url,
      photoUrl: path ? urls.get(path) ?? null : null,
      hidden: r.hidden,
      time: entryTimeLabel(r.created_at, timeZone),
    };
  });
  return { moments, photosMissing };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#23222B", light: "#FBF7F2" } });
}
