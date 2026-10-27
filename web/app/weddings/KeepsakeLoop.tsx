"use client";

import { useEffect, useRef } from "react";
import landing from "../_landing/landing.module.css";

/**
 * The real keepsake playing (a muted loop captured from a demo wedding).
 * With reduced motion it stays on its poster; nothing moves on its own.
 */
export function KeepsakeLoop() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (query.matches) el.pause();
      else el.play().catch(() => {});
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return (
    <video
      ref={video}
      className={landing.screenImg}
      src="/weddings/keepsake-loop.mp4"
      poster="/weddings/keepsake-poster.webp"
      muted
      loop
      playsInline
      preload="metadata"
      width={640}
      height={1384}
      aria-label="The keepsake playing: each guest's photo, song and words, one after another"
    />
  );
}
