import type { ReactNode } from "react";
import styles from "./landing.module.css";

/** An iPhone at true proportions (393 × 852 pt, 55 pt corners), drawn in CSS. */
export function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.phone} ${className}`}>
      <div className={styles.phoneScreen}>
        {children}
        <span className={styles.island} aria-hidden="true" />
      </div>
    </div>
  );
}

/** A real app screen captured from the simulator. */
export function Screen({ src, alt }: { src: string; alt: string }) {
  // Plain <img>: these are pre-sized webp captures; next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.screenImg} src={src} alt={alt} width={828} height={1800} loading="lazy" decoding="async" />;
}

const NoteGlyph = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      d="M9 18.5a2.5 2.5 0 1 1-2.5-2.5c.53 0 1.02.16 1.5.44V5.2a1 1 0 0 1 .78-.98l9-2a1 1 0 0 1 1.22.98v12.3a2.5 2.5 0 1 1-1.5-2.3V7.1l-8.5 1.9v9.5Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * The Lock Screen on the drive home, with the Soundtracks rectangular widget
 * under the clock and the capture control in the bottom-right button slot,
 * as iOS 18 renders them.
 */
export function LockScreen() {
  return (
    <div className={styles.lock} role="img" aria-label="iPhone Lock Screen at 11:48 PM with the Soundtracks widget: Capture a song">
      <p className={styles.lockDate}>Saturday, October 19</p>
      <p className={styles.lockTime}>11:48</p>
      <div className={styles.lockWidget}>
        <p className={styles.lockWidgetApp}>
          <NoteGlyph /> Soundtracks
        </p>
        <p className={styles.lockWidgetTitle}>Capture a song</p>
        <p className={styles.lockWidgetSub}>What&rsquo;s this one doing for you?</p>
      </div>
      <div className={styles.lockControls} aria-hidden="true">
        <span className={styles.lockButton}>
          {/* Lucide "flashlight" */}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z" />
            <line x1="6" x2="18" y1="6" y2="6" />
            <line x1="12" x2="12" y1="12" y2="12" />
          </svg>
        </span>
        <span className={`${styles.lockButton} ${styles.lockButtonOurs}`}>
          <NoteGlyph />
        </span>
      </div>
      <span className={styles.lockHome} aria-hidden="true" />
    </div>
  );
}
