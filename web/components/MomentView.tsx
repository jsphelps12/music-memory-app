"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Backdrop, PauseIcon, PlayIcon, type KeepsakeMoment } from "./Keepsake";
import k from "./keepsake.module.css";

/**
 * A single shared moment, on the keepsake's night stage: the photo (or the
 * cover), the song with its preview, the guest's words and name. Under it,
 * whose wedding it came from, and what Soundtracks is, once, plainly.
 */
export function MomentView({ names, when, moment }: { names: string; when: string; moment: KeepsakeMoment }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    }
  }

  return (
    <div className={k.book}>
      <section className={k.stage} aria-label={`${moment.guestName}'s moment`}>
        <div className={k.layers} aria-hidden="true">
          <Backdrop moment={moment} />
        </div>
        <header className={k.top}>
          <Link href="/" className={k.wordmark}>
            Soundtracks
          </Link>
        </header>
        <div className={k.now}>
          <p className={k.from}>From {names}&rsquo;s guest book</p>
          <p className={k.song}>
            <strong>{moment.title}</strong> <span>{moment.artist}</span>
          </p>
          {moment.words ? (
            <blockquote className={k.words} tabIndex={0} aria-label={`${moment.guestName} wrote`}>
              {moment.words}
            </blockquote>
          ) : null}
          <p className={k.by}>
            {moment.guestName} · {moment.when}
          </p>
          {moment.previewUrl ? (
            <div className={k.controls}>
              <button type="button" className={`${k.control} ${k.main}`} onClick={toggle} aria-label={playing ? "Pause" : "Play the song"}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
            </div>
          ) : null}
        </div>
        {moment.previewUrl ? (
          <>
            <div className={k.progress} aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <audio
              ref={audio}
              src={moment.previewUrl}
              preload="none"
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (el.duration) setProgress(el.currentTime / el.duration);
              }}
              onEnded={() => {
                setPlaying(false);
                setProgress(0);
              }}
            />
          </>
        ) : null}
      </section>

      <section className={k.notes} aria-labelledby="about-title">
        <div className={k.notesInner}>
          <h2 id="about-title" className={k.notesTitle}>
            {names}
          </h2>
          <p className={k.notesMeta}>{when}</p>
          <p className={k.about}>
            Every guest at their wedding picked a song and said why. Soundtracks keeps them together as a guest book
            that plays.
          </p>
          <p className={k.footer}>
            <Link href="/weddings">A guest book that plays, for your wedding</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
