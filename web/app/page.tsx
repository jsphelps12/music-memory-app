import type { Metadata } from "next";
import Link from "next/link";
import { DM_Serif_Display, DM_Sans, Newsreader } from "next/font/google";
import { Story } from "./_landing/Story";
import { StickyBar } from "./_landing/StickyBar";
import { Hero } from "./_landing/Hero";
import styles from "./_landing/landing.module.css";

const serif = DM_Serif_Display({ weight: "400", subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const reading = Newsreader({ subsets: ["latin"], variable: "--font-reading", display: "swap", style: ["normal", "italic"] });

const APP_STORE = "https://apps.apple.com/us/app/soundtracks/id6759203604";

export const metadata: Metadata = {
  title: "Soundtracks: a journal for the songs that mark your days",
  description:
    "Catch the song while it's playing, write a line or pages, and let it bring the moment back years later. A music journal for iPhone.",
  openGraph: {
    title: "Soundtracks",
    description: "A journal for the songs that mark your days.",
    images: ["/photos/drive-1200.webp"],
  },
};

function AppStoreBadge({ className = "" }: { className?: string }) {
  return (
    <a className={`${styles.badge} ${className}`} href={APP_STORE} aria-label="Download Soundtracks on the App Store">
      {/* Apple's official badge artwork, unmodified. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/badges/app-store-black.svg" alt="" width={150} height={50} />
    </a>
  );
}

// A demo journal, written for the screenshots. Entries, not endorsements.
const ENTRIES = [
  {
    kind: "A song that brought something back",
    song: "Dancing In the Moonlight",
    artist: "King Harvest",
    date: "July 4, 2018",
    text: "Fourth of July at the lake. Sam had one speaker and this was the only song we agreed on.",
  },
  {
    kind: "Something new you can’t stop playing",
    song: "Motion Sickness",
    artist: "Phoebe Bridgers",
    date: "October 2",
    text: "Can’t stop playing this one.",
  },
  {
    kind: "A day, with a song attached",
    song: "Pink + White",
    artist: "Frank Ocean",
    date: "October 14",
    text: "First real fall morning. Walked to the coffee shop the long way so this could play twice.",
  },
];

// The tracklist of a demo shared album.
const ALBUM = [
  { song: "Dreams", artist: "Fleetwood Mac", by: "Priya", note: "Boulder, windows down" },
  { song: "Dancing In the Moonlight", artist: "King Harvest", by: "Sam", note: "the one speaker" },
  { song: "Heat Waves", artist: "Glass Animals", by: "Josh", note: "on the roof, New Year’s" },
  { song: "Lovely Day", artist: "Bill Withers", by: "Mara", note: "every Sunday that summer" },
];

export default function Home() {
  return (
    <main className={`${styles.page} ${serif.variable} ${sans.variable} ${reading.variable}`}>
      <StickyBar>
        <AppStoreBadge />
      </StickyBar>

      <Hero badge={<AppStoreBadge />} />

      <Story />

      <section className={styles.kinds} aria-labelledby="kinds-title">
        <h2 id="kinds-title" className={styles.sectionTitle}>
          Three kinds of entries. They all count.
        </h2>
        <ol className={styles.entryList}>
          {ENTRIES.map((e) => (
            <li key={e.song} className={styles.entryRow}>
              <p className={styles.entryKind}>{e.kind}</p>
              <div>
                <p className={styles.entrySong}>
                  {e.song} <span>{e.artist}</span>
                </p>
                <p className={styles.entryText}>{e.text}</p>
                <p className={styles.entryDate}>{e.date}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.album} aria-labelledby="album-title">
        <div className={styles.albumCopy}>
          <h2 id="album-title" className={styles.sectionTitle}>
            Some songs belong to more than one person.
          </h2>
          <p className={styles.bodyText}>
            Make an album for a road trip, a wedding, a year. Friends add their song and a few words from a link. They
            don&rsquo;t need the app, and neither does anyone you share it with.
          </p>
        </div>
        <figure className={styles.tracklist}>
          <figcaption>
            <span className={styles.tracklistTitle}>Windows down</span>
            <span className={styles.tracklistMeta}>4 songs · 4 people</span>
          </figcaption>
          <ol>
            {ALBUM.map((t, i) => (
              <li key={t.song}>
                <span className={styles.trackNo}>{i + 1}</span>
                <span className={styles.trackSong}>
                  {t.song} <em>{t.artist}</em>
                </span>
                <span className={styles.trackBy}>
                  {t.by}, &ldquo;{t.note}&rdquo;
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <section className={styles.note} aria-labelledby="note-title">
        <picture className={styles.notePhoto}>
          <source media="(min-width: 900px)" srcSet="/photos/driver-2400.webp" />
          <img src="/photos/driver-1200.webp" alt="" loading="lazy" />
        </picture>
        <h2 id="note-title" className={styles.visuallyHidden}>
          Why Soundtracks exists
        </h2>
        <div className={styles.noteBody}>
          <p>
            Some songs take me straight back. One comes on and I&rsquo;m in a specific kitchen, a specific car, next to
            a specific person, years ago, like no time passed.
          </p>
          <p>
            I wanted one place to keep those: the song, and whatever it brings back. So I built it.
          </p>
          <p className={styles.signature}>Josh, who made Soundtracks</p>
        </div>
      </section>

      <section id="get" className={styles.close}>
        <h2 className={styles.closeTitle}>Start with the song that&rsquo;s playing right now.</h2>
        <AppStoreBadge />
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Soundtracks</span>
        <nav aria-label="Legal">
          <Link href="/weddings">Weddings</Link>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:founder@soundtracks.app">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
