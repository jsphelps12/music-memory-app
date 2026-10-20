import Link from "next/link";
import type { ReactNode } from "react";
import { Lockup, RecordMark } from "./RecordMark";
import styles from "./landing.module.css";

/**
 * The drive home as the ground, and the song's sleeve with our record sliding
 * out of it: the song is theirs, the record is yours. Blonde ("Nights")
 * on the night it came out.
 */
export function Hero({ badge }: { badge: ReactNode }) {
  return (
    <section id="top" className={styles.hero}>
      {/* Unsplash photograph (Unsplash License); see public/photos/SOURCES.md. */}
      <picture className={styles.heroPhoto}>
        <source media="(min-width: 900px)" srcSet="/photos/drive-2400.webp" />
        <img src="/photos/drive-1200.webp" alt="" fetchPriority="high" />
      </picture>

      <header className={styles.nav}>
        <Link href="/" className={styles.wordmark}>
          <Lockup />
        </Link>
      </header>

      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>Some songs hold a whole summer.</h1>
          <p className={styles.heroLede}>
            Soundtracks is a journal for them. Catch the song while it&rsquo;s playing, write a line or pages, and let
            it bring the moment back years from now.
          </p>
          {badge}
          <p className={styles.heroFine}>Free for iPhone. Works with Apple Music.</p>
        </div>

        <figure className={styles.sleeve}>
          <div className={styles.sleevePair}>
            <RecordMark size={600} className={styles.sleeveRecord} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/art/blonde-760.jpg" alt="Blonde by Frank Ocean" width={760} height={760} />
          </div>
          <figcaption>
            <span className={styles.sleeveWhen}>Saturday, August 20, 2016 · 11:52 PM</span>
            <span className={styles.sleeveSong}>
              <span>Nights</span> <em>Frank Ocean</em>
            </span>
            <span className={styles.sleeveText}>
              Drove past our exit to hear the beat switch again.
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
