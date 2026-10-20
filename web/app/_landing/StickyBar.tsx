"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./landing.module.css";

/** Wordmark and App Store badge that slide in once the hero is out of view,
 *  so the download is always one tap away without a second badge on top. */
export function StickyBar({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting), {
      rootMargin: "-80px 0px 0px 0px",
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.bar} data-shown={shown}>
      <a href="#top" className={styles.wordmark}>
        Soundtracks
      </a>
      {children}
    </div>
  );
}
