import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { guestLink } from "@/lib/occasionHost";
import { getHostSupabase } from "@/lib/supabase/server";
import { PrintButton } from "../HostActions";
import c from "./cards.module.css";

export const metadata: Metadata = { title: "Table cards" };
export const dynamic = "force-dynamic";

// Four cards to a letter page, cut along the dashed lines. Printed from the
// browser ("Save as PDF" works too), so there's no PDF library to keep.
export default async function TableCards({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await getHostSupabase();
  const { data: occasion } = await supabase
    .from("occasions")
    .select("id, names, slug, status")
    .eq("id", id)
    .maybeSingle<{ id: string; names: string; slug: string; status: string }>();
  if (!occasion) notFound();
  if (occasion.status === "draft") redirect(`/host/${occasion.id}`);

  const link = guestLink(occasion.slug);
  const qr = await QRCode.toString(link, { type: "svg", margin: 0, color: { dark: "#23222B", light: "#0000" } });
  const shortLink = link.replace(/^https:\/\//, "");

  return (
    <main className={c.page}>
      <div className={c.toolbar}>
        <Link href={`/host/${occasion.id}`}>Back</Link>
        <p>Four cards a page. Print on card stock and cut along the dashed lines.</p>
        <PrintButton />
      </div>
      <div className={c.sheet}>
        {Array.from({ length: 4 }, (_, i) => (
          <section key={i} className={c.card} aria-label="Table card">
            <p className={c.names}>{occasion.names}</p>
            <p className={c.ask}>Pick a song for us.</p>
            <p className={c.how}>Scan, choose a song, add a photo from tonight and your name. It goes in our guest book.</p>
            <div className={c.qr} dangerouslySetInnerHTML={{ __html: qr }} />
            <p className={c.url}>{shortLink}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
