import type { Metadata } from "next";
import QRCode from "qrcode";
import { cardsByGuest } from "@/lib/occasionPrint";
import { loadPrint } from "@/lib/occasionPrintData";
import { ProofBar } from "../ProofBar";
import p from "../print.module.css";

export const metadata: Metadata = { title: "Thank-you cards proof" };
export const dynamic = "force-dynamic";

const PER_SHEET = 4;

/**
 * Thank-you cards: one per guest, with the song they picked and a code that
 * plays their moment (its own shared page). Four to a letter page, cut on
 * the dashed lines.
 */
export default async function CardsProof({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { occasion, moments, sharing, momentUrl } = await loadPrint(id);
  const cards = await Promise.all(
    cardsByGuest(moments).map(async (m) => {
      const url = momentUrl(m);
      const qr = url ? await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#23222B", light: "#0000" } }) : null;
      return { m, qr };
    })
  );
  const sheets = Array.from({ length: Math.ceil(cards.length / PER_SHEET) }, (_, i) => cards.slice(i * PER_SHEET, (i + 1) * PER_SHEET));

  return (
    <main className={p.page}>
      <ProofBar
        id={id}
        note={
          sharing
            ? null
            : "The codes go on once your guest book is out and shared: each one opens that guest's own moment."
        }
      >
        {cards.length} thank-you {cards.length === 1 ? "card" : "cards"}, one per guest, four to a page.
      </ProofBar>
      {sheets.map((sheet, i) => (
        <section key={i} className={`${p.sheet} ${p.cardSheet}`} aria-label={`Cards, page ${i + 1}`}>
          {sheet.map(({ m, qr }) => (
            <article key={m.id} className={p.card} aria-label={`Card for ${m.guestName}`}>
              <p className={p.cardTo}>{m.guestName},</p>
              <p className={p.cardThanks}>Thank you for being part of our day.</p>
              <p className={p.cardSong}>
                You picked
                <span className={p.cardTitle}>{m.title}</span>
                <span className={p.cardArtist}>{m.artist}</span>
              </p>
              <div className={p.cardFoot}>
                <p>
                  {occasion.names}
                  <br />
                  {qr ? "Scan to hear it again" : null}
                </p>
                {qr ? <span className={p.qr} dangerouslySetInnerHTML={{ __html: qr }} /> : null}
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  );
}
