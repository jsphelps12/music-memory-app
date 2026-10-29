import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { bookPages, cardsByGuest } from "@/lib/occasionPrint";
import { loadPrint } from "@/lib/occasionPrintData";
import h from "../../host.module.css";
import p from "./print.module.css";

export const metadata: Metadata = { title: "Things to hold" };
export const dynamic = "force-dynamic";

/**
 * The three things a couple can order, each with a proof made from their
 * own guest book (docs/OCCASIONS.md, things to hold). Ordering comes with
 * checkout; the proofs work now, and print or save as a PDF from here.
 */
export default async function PrintIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { occasion, moments } = await loadPrint(id);
  const cards = cardsByGuest(moments).length;
  const pages = bookPages(moments).length;
  const items = [
    {
      href: "tracklist",
      title: "The tracklist print",
      body: `Your wedding as the back of a record sleeve: all ${moments.length} songs and who picked each, with a code that plays them. 18 × 24 in.`,
      price: "$49 · framed $129",
    },
    {
      href: "cards",
      title: "Thank-you cards",
      body: `One for each of your ${cards} guests, with the song they picked and a code that plays their moment.`,
      price: "$2.50 a card",
    },
    {
      href: "book",
      title: "The liner-notes book",
      body: `A page for every moment with a photo or words, and the song-only picks on tracklist pages at the back: ${pages + 2} pages, 8 × 8 in.`,
      price: "$119",
    },
  ];

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar>
          <Link href={`/host/${id}`} className={s.quietButton}>
            {occasion.names}
          </Link>
        </TopBar>
        <h1 className={s.headline}>Things to hold</h1>
        <p className={`${s.body} ${s.lede}`}>
          Each one is made from your guest book as it is now: hide a moment and it leaves the proofs too. Ordering opens
          soon; until then, look them over, or save one as a PDF.
        </p>
        {moments.length ? (
          <ul className={h.list}>
            {items.map((x) => (
              <li key={x.href} className={p.listRow}>
                <div>
                  <h2 className={s.title}>{x.title}</h2>
                  <p className={s.body}>{x.body}</p>
                  <p className={s.meta}>{x.price}</p>
                </div>
                <Link className={s.textLink} href={`/host/${id}/print/${x.href}`}>
                  See the proof
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.body}>The proofs fill in as moments arrive.</p>
        )}
      </div>
    </main>
  );
}
