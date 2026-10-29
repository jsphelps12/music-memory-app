import type { Metadata } from "next";
import QRCode from "qrcode";
import { RecordMark } from "@/app/_landing/RecordMark";
import { tracklistLayout } from "@/lib/occasionPrint";
import { loadPrint } from "@/lib/occasionPrintData";
import { ProofBar } from "../ProofBar";
import p from "../print.module.css";

export const metadata: Metadata = { title: "Tracklist print proof" };
export const dynamic = "force-dynamic";

/**
 * The tracklist print, 18 × 24 in: the wedding as the back of a record
 * sleeve, every song and the guest who picked it, in the order the night
 * went, with a code that plays the guest book.
 */
export default async function TracklistProof({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { occasion, moments, sharing, playUrl } = await loadPrint(id);
  const { sides, rowCqw } = tracklistLayout(moments);
  const people = new Set(moments.map((m) => m.guestName.trim().toLowerCase())).size;
  const qr = await QRCode.toString(playUrl, { type: "svg", margin: 0, color: { dark: "#23222B", light: "#0000" } });

  return (
    <main className={p.page}>
      <ProofBar
        id={id}
        note={sharing ? null : "The code opens your own preview for now. Once your guest book is out and shared, it plays it for anyone."}
      >
        The tracklist print, 18 × 24 in, from your guest book as it is now.
      </ProofBar>
      <section className={`${p.sheet} ${p.poster}`} aria-label="Tracklist print">
        <header className={p.posterHead}>
          <h1 className={p.posterNames}>{occasion.names}</h1>
          <p className={p.posterMeta}>{occasion.when}</p>
        </header>
        <div className={p.sides} style={{ ["--row" as string]: rowCqw }}>
          {sides.map((side) => (
            <ol key={side.label} className={p.side}>
              <li className={p.sideLabel} aria-hidden="true">
                Side {side.label}
              </li>
              {side.tracks.map((m, i) => (
                <li key={m.id} className={p.track}>
                  <span className={p.trackNo}>{side.start + i + 1}</span>
                  <span className={p.trackText}>
                    <span className={p.trackSong}>{m.title}</span>
                    <span className={p.trackBy}>{m.guestName}</span>
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
        <footer className={p.posterFoot}>
          <RecordMark className={p.mark} grooves={false} />
          <p>
            {moments.length} {moments.length === 1 ? "song" : "songs"} from {people} {people === 1 ? "guest" : "guests"}
            <br />
            Scan to play
          </p>
          <span className={p.qr} dangerouslySetInnerHTML={{ __html: qr }} />
        </footer>
      </section>
    </main>
  );
}
