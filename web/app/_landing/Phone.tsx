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
