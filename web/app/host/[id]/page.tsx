import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { guestLink } from "@/lib/occasionHost";
import { formatEventDate } from "@/lib/occasionGuest";
import { getHostSupabase } from "@/lib/supabase/server";
import h from "../host.module.css";
import { ActivateButton, CopyButton } from "./HostActions";

export const metadata: Metadata = { title: "Your wedding" };
export const dynamic = "force-dynamic";

type Occasion = {
  id: string;
  names: string;
  event_date: string;
  city: string | null;
  slug: string;
  status: "draft" | "collecting" | "curating" | "revealed";
  collect_closes_at: string | null;
  time_zone: string;
};

export default async function OccasionOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await getHostSupabase();
  const [{ data: occasion, error }, { count }] = await Promise.all([
    supabase
      .from("occasions")
      .select("id, names, event_date, city, slug, status, collect_closes_at, time_zone")
      .eq("id", id)
      .maybeSingle<Occasion>(),
    supabase.from("occasion_entries").select("id", { count: "exact", head: true }).eq("occasion_id", id),
  ]);
  if (error) throw error;
  if (!occasion) notFound();

  const link = guestLink(occasion.slug);
  const when = [formatEventDate(occasion.event_date), occasion.city].filter(Boolean).join(" · ");
  const closes = occasion.collect_closes_at
    ? new Date(occasion.collect_closes_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: occasion.time_zone,
      })
    : null;
  const devPayments = process.env.NEXT_PUBLIC_DEV_PAYMENTS === "true";

  return (
    <main className={s.page}>
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
            {devPayments ? (
              <ActivateButton occasionId={occasion.id} />
            ) : (
              <p className={s.body}>Checkout opens soon. We&rsquo;ll email you when it does.</p>
            )}
          </section>
        ) : (
          <>
            <section className={h.panel} aria-labelledby="link-title">
              <h2 id="link-title" className={s.title}>
                Your guests&rsquo; link
              </h2>
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
            </section>
            <p className={`${s.body} ${h.after}`}>
              {count === 1 ? "1 song so far." : `${count ?? 0} songs so far.`}
              {occasion.status === "collecting" && closes ? ` Guests can add songs until ${closes}.` : null}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#23222B", light: "#FBF7F2" } });
}
