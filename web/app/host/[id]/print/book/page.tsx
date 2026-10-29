/* eslint-disable @next/next/no-img-element -- signed photo URLs that expire in an hour; the optimizer would cache (and bill) each one. */
import type { Metadata } from "next";
import QRCode from "qrcode";
import { bookPages, fitWords, wordsSize } from "@/lib/occasionPrint";
import { loadPrint } from "@/lib/occasionPrintData";
import { ProofBar } from "../ProofBar";
import p from "../print.module.css";

export const metadata: Metadata = { title: "Liner-notes book proof" };
export const dynamic = "force-dynamic";

/**
 * The liner-notes book, 8 × 8 in: a cover, a full page for every moment with
 * a photo or words (the guest's words in Newsreader, as everywhere), the
 * song-only picks on tracklist pages at the back, and a last page.
 */
export default async function BookProof({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { occasion, moments, sharing, playUrl } = await loadPrint(id, { photos: true });
  const pages = bookPages(moments);
  const qr = await QRCode.toString(playUrl, { type: "svg", margin: 0, color: { dark: "#23222B", light: "#0000" } });

  return (
    <main className={p.page}>
      <ProofBar
        id={id}
        note={sharing ? null : "The cover's code opens your own preview for now; once your guest book is out and shared, it plays it for anyone."}
      >
        The liner-notes book: {pages.length + 2} pages, 8 × 8 in. Photos are shown from your guest book; the printed
        book uses the full-size files.
      </ProofBar>

      <section className={`${p.sheet} ${p.bookPage} ${p.cover}`} aria-label="Cover">
        <div>
          <h1 className={p.coverNames}>{occasion.names}</h1>
          <p className={p.coverMeta}>{occasion.when}</p>
        </div>
        <div className={p.coverFoot}>
          <p>
            The songs our guests picked,
            <br />
            and what they had to say.
          </p>
          <span className={p.qr} dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      </section>

      {pages.map((page, i) =>
        page.kind === "moment" ? (
          <section
            key={page.moment.id}
            className={`${p.sheet} ${p.bookPage} ${page.moment.photoUrl ? "" : p.textOnly}`}
            aria-label={`${page.moment.guestName}'s page`}
          >
            {page.moment.photoUrl ? <img className={p.bookPhoto} src={page.moment.photoUrl} alt="" /> : null}
            <p className={p.bookSong}>
              <strong>{page.moment.title}</strong> {page.moment.artist}
            </p>
            {page.moment.words ? (
              <p className={`${p.bookWords} ${p[wordsSize(page.moment.words, !!page.moment.photoUrl)]}`}>
                {fitWords(page.moment.words, !!page.moment.photoUrl)}
              </p>
            ) : null}
            <p className={p.bookBy}>
              <span>
                {page.moment.guestName} · {page.moment.when}
              </span>
              <span>{page.number}</span>
            </p>
          </section>
        ) : (
          <section key={`list-${i}`} className={`${p.sheet} ${p.bookPage}`} aria-label="More songs">
            <h2 className={p.listTitle}>And the songs</h2>
            <ol className={p.listRows}>
              {page.tracks.map(({ moment, number }) => (
                <li key={moment.id}>
                  <span>{number}</span>
                  <span>
                    <strong>{moment.title}</strong> {moment.artist}
                  </span>
                  <span>{moment.guestName}</span>
                </li>
              ))}
            </ol>
          </section>
        )
      )}

      <section className={`${p.sheet} ${p.bookPage} ${p.textOnly}`} aria-label="Last page">
        <p className={p.coverMeta}>
          {moments.length} {moments.length === 1 ? "song" : "songs"}, kept by Soundtracks.
        </p>
      </section>
    </main>
  );
}
