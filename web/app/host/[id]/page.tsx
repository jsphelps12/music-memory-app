import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { mostPicked } from "@/lib/occasionBook";
import { allEntries, signPhotos } from "@/lib/occasionHostData";
import {
  bookLink,
  bookReadyMessage,
  entryTimeLabel,
  groupChatMessages,
  guestLink,
  autoRevealLabel,
  lastDayLabel,
} from "@/lib/occasionHost";
import { formatEventDate } from "@/lib/occasionGuest";
import { getHostSupabase } from "@/lib/supabase/server";
import h from "../host.module.css";
import { ActivateButton, AutoRefresh, CloseCollecting, CopyButton, JustUsSwitch, RevealButton } from "./HostActions";
import { PhotoZip } from "./Downloads";
import { Moments, type Moment } from "./Moments";
import { DeleteWedding, Partner, type Hosts } from "./Ownership";

export const metadata: Metadata = { title: "Your wedding" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  book_token: string;
};

export default async function OccasionDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, entries, { data: hostsData }] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, slug, status, collect_closes_at, time_zone, share_book_with_guests, book_token")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    allEntries(supabase, id, { newestFirst: true }),
    supabase.rpc("occasion_hosts", { p_occasion_id: id }),
  ]);
  if (error) throw error;
  if (!occasion) notFound();

  const hosts = parseHosts(hostsData);
  const { photoUrl, photosMissing } = await signPhotos(supabase, entries);
  const moments: Moment[] = entries.map((r) => ({
    id: r.id,
    guestName: r.guest_name,
    words: r.words,
    title: r.song_title,
    artist: r.song_artist,
    artworkUrl: r.song_artwork_url,
    photoUrl: photoUrl(r),
    hidden: r.hidden,
    time: entryTimeLabel(r.created_at, occasion.time_zone),
  }));
  const shown = entries.filter((e) => !e.hidden);
  const picked = mostPicked(
    shown.map((e) => ({ appleMusicId: e.song_apple_id, title: e.song_title, artist: e.song_artist }))
  );
  const phase = phaseOf(occasion);
  const link = guestLink(occasion.slug);
  const book = bookLink(occasion.slug, occasion.book_token);
  const when = [formatEventDate(occasion.event_date), occasion.city].filter(Boolean).join(" · ");
  const lastDay = occasion.collect_closes_at ? lastDayLabel(occasion.collect_closes_at, occasion.time_zone) : null;
  const revealsOn = occasion.collect_closes_at ? autoRevealLabel(occasion.collect_closes_at, occasion.time_zone) : null;
  const messages = groupChatMessages(link);
  const preview = `/host/${occasion.id}/book`;
  // The zip follows the keepsake: visible moments with a photo. Its links are
  // signed when the couple taps download, so only the count is needed here.
  const photoCount = shown.filter((e) => e.photo_source).length;

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
            {hosts.youAreHost ? <DeleteWedding occasionId={occasion.id} paid={false} /> : null}
          </section>
        ) : (
          <>
            <p className={`${s.body} ${h.after}`} aria-live="polite">
              {statusLine(phase, shown.length, lastDay)}
            </p>
            {picked.length ? (
              <p className={s.meta}>
                Most picked:{" "}
                {picked
                  .slice(0, 3)
                  .map((p) => `${p.title} (${p.count})`)
                  .join(", ")}
              </p>
            ) : null}

            {phase === "closed" ? (
              <section className={`${h.panel} ${h.after}`} aria-labelledby="reveal-title">
                <h2 id="reveal-title" className={s.title}>
                  Reveal your guest book
                </h2>
                <p className={s.body}>
                  Play it through, hide anything you&rsquo;d rather not keep, then reveal it.
                  {revealsOn && shown.length ? ` If you don't, it reveals itself on ${revealsOn}.` : ""}{" "}
                  {occasion.share_book_with_guests
                    ? "We'll give you a link and a message for the group chat, so everyone who added a song can open it."
                    : "Just us is on, so only the two of you will be able to open it."}
                </p>
                <div className={h.actions}>
                  <Link className={s.textLink} href={preview}>
                    Play it first
                  </Link>
                </div>
                <RevealButton occasionId={occasion.id} disabled={shown.length === 0} />
              </section>
            ) : null}

            {phase === "revealed" ? (
              <section className={`${h.panel} ${h.after}`} aria-labelledby="out-title">
                <h2 id="out-title" className={s.title}>
                  Your guest book is out
                </h2>
                {occasion.share_book_with_guests ? (
                  <>
                    <p className={h.link}>{book}</p>
                    <div className={h.actions}>
                      <CopyButton text={book} />
                      <Link className={s.textLink} href={preview}>
                        Open it
                      </Link>
                    </div>
                    <Message label="For the group chat" text={bookReadyMessage(book)} />
                  </>
                ) : (
                  <>
                    <p className={s.body}>Just us is on: only the two of you can open it.</p>
                    <Link className={`${s.button} ${h.inline}`} href={preview}>
                      Open your guest book
                    </Link>
                  </>
                )}
              </section>
            ) : null}

            <section className={h.section} aria-labelledby="moments-title">
              <div className={h.sectionHead}>
                <h2 id="moments-title" className={s.title}>
                  Moments
                </h2>
                {phase === "open" && shown.length ? (
                  <Link className={s.textLink} href={preview}>
                    Preview the guest book
                  </Link>
                ) : null}
              </div>
              {photosMissing ? <p className={s.meta}>Some photos didn&rsquo;t load. Refresh to try again.</p> : null}
              <Moments moments={moments} />
            </section>

            {phase !== "revealed" ? (
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
            ) : null}

            {shown.length ? (
              <section className={h.section} aria-labelledby="keep-title">
                <h2 id="keep-title" className={s.title}>
                  Keep it
                </h2>
                {photoCount ? <PhotoZip occasionId={occasion.id} slug={occasion.slug} count={photoCount} /> : null}
                <Link className={s.textLink} href={`/host/${occasion.id}/notes`}>
                  Every note, to print or save as a PDF
                </Link>
                <p className={s.meta}>Hidden moments are left out of both, as they are from the guest book.</p>
              </section>
            ) : null}

            <section className={h.section} aria-labelledby="settings-title">
              <h2 id="settings-title" className={s.title}>
                Settings
              </h2>
              <JustUsSwitch occasionId={occasion.id} initial={occasion.share_book_with_guests} />
              <Link className={s.textLink} href={`/host/${occasion.id}/edit`}>
                Edit names, date and suggested songs
              </Link>
              {phase === "open" ? <CloseCollecting occasionId={occasion.id} /> : null}
              <Partner occasionId={occasion.id} hosts={hosts} />
              {hosts.youAreHost ? <DeleteWedding occasionId={occasion.id} paid /> : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/** occasion_hosts(), checked. Unknown means "not the primary host", the safe default. */
function parseHosts(raw: unknown): Hosts {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    hostEmail: str(o.hostEmail),
    cohostEmail: str(o.cohostEmail),
    youAreHost: o.youAreHost === true,
    invitePending: o.invitePending === true,
  };
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
  if (phase === "closed") return `${count}. Your guest book is closed to new songs.`;
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

function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#23222B", light: "#FBF7F2" } });
}
