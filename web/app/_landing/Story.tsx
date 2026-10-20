"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Screen } from "./Phone";
import styles from "./landing.module.css";

type When = { day: string; year: number; tail: string };

type Chapter = {
  id: string;
  when: When;
  title: string;
  body: string[];
  screen: { src: string; alt: string };
  /** Writing set at reading size beside the screen. */
  excerpt?: string[];
};

const CHAPTERS: Chapter[] = [
  {
    id: "catch",
    when: { day: "Saturday, October 19", year: 2019, tail: "11:48 PM" },
    title: "Catch it while it’s still playing.",
    body: [
      "Whatever’s on in Apple Music fills itself in. Or tap Identify and Soundtracks names the song playing in the room.",
      "It’s one tap from the Lock Screen, Control Center or the Action button, so you can get it down before the moment passes.",
    ],
    screen: { src: "/screens/capture.webp", alt: "Soundtracks capture screen: Space Song by Beach House, with the first line of an entry" },
  },
  {
    id: "write",
    when: { day: "Saturday, October 19", year: 2019, tail: "11:52 PM" },
    title: "Write a line. Or pages.",
    body: [
      "A page made for reading, not a form to fill in. Start with nothing, a sentence, or everything you can remember.",
      "Drafts save as you go, so closing the app never costs you a word.",
    ],
    screen: { src: "/screens/writer.webp", alt: "The full-page writer with a two-paragraph entry about Space Song, 46 words" },
    excerpt: [
      "Drove the long way home from Mara’s so this would finish before the exit. Windows cracked, first cold night of the year, the whole river lit up orange under the bridge.",
      "I don’t want to forget what it felt like to not be in a hurry.",
    ],
  },
  {
    id: "return",
    when: { day: "Monday, October 19", year: 2026, tail: "seven years later" },
    title: "Seven years later, it finds you.",
    body: [
      "On this day brings back what you saved on today’s date, oldest first. Weekly rewinds, moods, people and years do the rest.",
      "You don’t have to remember to look back. The journal does it for you.",
    ],
    screen: { src: "/screens/rediscover.webp", alt: "Rediscover: On this day, 7 years ago, Space Song by Beach House" },
  },
  {
    id: "play",
    when: { day: "Monday, October 19", year: 2026, tail: "10:14 PM" },
    title: "Press play and you’re back on the bridge.",
    body: [
      "Every entry keeps the song, the date, the place and your words together. Tap the artwork and it plays.",
    ],
    screen: { src: "/screens/entry.webp", alt: "The 2019 entry for Space Song, playing, with the full reflection" },
  },
];

const whenText = (w: When) => `${w.day}, ${w.year} · ${w.tail}`;

/** The year runs from the old value to the new one instead of swapping. */
function useRunningYear(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    // With reduced motion the "run" is one frame long: it lands immediately.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const duration = reduce ? 0 : 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(start + (target - start) * eased);
      setShown(value);
      from.current = value;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return shown;
}

/**
 * The signature: one phone pinned beside the story. Its screen and the date
 * under it advance chapter by chapter, from the night the song was caught to
 * the day it comes back. On small screens (and without JS) every chapter
 * carries its own screen and date inline.
 */
export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.stage));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const current = CHAPTERS[active].when;
  const year = useRunningYear(current.year);

  return (
    <section className={styles.story} aria-label="One song, seven years">
      <div className={styles.chapters}>
        {CHAPTERS.map((chapter, i) => (
          <article
            key={chapter.id}
            id={chapter.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-stage={i}
            className={styles.chapter}
          >
            <h2 className={styles.chapterTitle}>{chapter.title}</h2>
            <p className={styles.chapterWhen}>{whenText(chapter.when)}</p>
            {chapter.body.map((p) => (
              <p key={p} className={styles.chapterBody}>
                {p}
              </p>
            ))}
            {chapter.excerpt ? (
              <blockquote className={styles.excerpt}>
                {chapter.excerpt.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <footer>Space Song · Beach House · 46 words</footer>
              </blockquote>
            ) : null}
            <div className={styles.chapterPhone}>
              <Phone>
                <Screen src={chapter.screen.src} alt={chapter.screen.alt} />
              </Phone>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.storyStage} aria-hidden="true">
        <div className={styles.storyStageInner}>
          <Phone>
            {CHAPTERS.map((chapter, i) => (
              <div key={chapter.id} className={styles.stageScreen} data-active={i === active}>
                <Screen src={chapter.screen.src} alt="" />
              </div>
            ))}
          </Phone>
          <p className={styles.stageWhen}>
            {current.day}, <span className={styles.stageYear}>{year}</span> · {current.tail}
          </p>
        </div>
      </div>
    </section>
  );
}
