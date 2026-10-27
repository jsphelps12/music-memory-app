"use client";
/* eslint-disable @next/next/no-img-element -- photos are signed URLs that expire in hours; the image optimizer would cache (and bill) each one. */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { artworkAt, momentLink, type BookMoment, type Picked } from "@/lib/occasionBook";
import k from "./keepsake.module.css";

export type KeepsakeMoment = BookMoment & { when: string };

type Props = {
  names: string;
  /** "Saturday, June 14, 2027 · Hudson, New York" */
  when: string;
  /** "37 songs from 35 people" */
  summary: string;
  moments: KeepsakeMoment[];
  picked: Picked[];
  /** The host's preview: a note across the top and a way back. */
  preview?: { note: string; backHref: string };
  /** The wedding's slug, when its moments can be shared (revealed, not "Just us"). */
  shareSlug?: string;
};

// A moment without a song preview stays up this long.
const SILENT_MS = 12_000;

/**
 * Starts playback. A play() cut short by the next load (skipping quickly)
 * rejects with AbortError: that's expected and leaves playing alone. Any
 * other refusal (autoplay blocked, unplayable) means we're not playing.
 */
function playOrStop(el: HTMLAudioElement, stop: () => void) {
  el.play().catch((e: unknown) => {
    if ((e as { name?: string } | null)?.name !== "AbortError") stop();
  });
}

/** A tenth of a second of silence, to unlock audio from a tap on a moment with no preview. */
function silence(): string {
  const n = 800;
  const bytes = new Uint8Array(44 + n);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + n, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit silence
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/**
 * The keepsake: the wedding played back like a radio show, one moment at a
 * time in the order the night went, with the tracklist underneath. One
 * <audio> element plays every preview, so after the first tap iOS keeps
 * playing from song to song.
 */
export function Keepsake({ names, when, summary, moments, picked, preview, shareSlug }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const stage = useRef<HTMLElement>(null);
  // Which moment the audio element was last loaded for, so moving to the
  // next one restarts its song even when two guests picked the same one.
  const loadedFor = useRef<string | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const total = moments.length;
  const current = moments[index];
  const cover = moments.find((m) => m.photoUrl) ?? moments[0];

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      setPrevious(index);
      setIndex(next);
      setProgress(0);
      setFinished(false);
    },
    [index, total]
  );

  const advance = useCallback(() => {
    if (index + 1 < total) go(index + 1);
    else {
      setPlaying(false);
      setFinished(true);
    }
  }, [go, index, total]);

  // Load and play the current moment's song whenever it changes.
  useEffect(() => {
    const el = audio.current;
    if (!started || !el || !current) return;
    if (skipTimer.current) clearTimeout(skipTimer.current);
    const fresh = loadedFor.current !== current.id;
    loadedFor.current = current.id;
    if (current.previewUrl) {
      if (el.src !== current.previewUrl) el.src = current.previewUrl;
      else if (fresh) el.currentTime = 0;
      if (playing) playOrStop(el, () => setPlaying(false));
      else el.pause();
      return;
    }
    // Song-only moments without a preview still get their turn.
    el.pause();
    el.removeAttribute("src");
    if (!playing) return;
    const startedAt = Date.now() - progress * SILENT_MS;
    const timer = setInterval(() => {
      const p = (Date.now() - startedAt) / SILENT_MS;
      if (p >= 1) {
        clearInterval(timer);
        advance();
      } else setProgress(p);
    }, 200);
    return () => clearInterval(timer);
    // progress is read once when (re)starting the timer, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, current, playing, advance]);

  // The photo after this one, fetched ahead so it's ready.
  useEffect(() => {
    const next = moments[index + 1];
    const src = next?.photoUrl ?? artworkAt(next?.artworkUrl ?? null, 1200);
    if (src) new Image().src = src;
  }, [index, moments]);

  // Lock screen and headphone controls.
  useEffect(() => {
    if (!started || !current || !("mediaSession" in navigator)) return;
    const art = artworkAt(current.artworkUrl, 512);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: `${names} · ${current.guestName}`,
      artwork: art ? [{ src: art, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => go(index + 1));
    navigator.mediaSession.setActionHandler("previoustrack", () => go(index - 1));
    return () => {
      navigator.mediaSession.metadata = null;
      for (const action of ["play", "pause", "nexttrack", "previoustrack"] as const) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    };
  }, [started, current, names, go, index]);

  useEffect(
    () => () => {
      if (skipTimer.current) clearTimeout(skipTimer.current);
    },
    []
  );

  // Every way of starting runs inside the tap itself: Safari only lets audio
  // begin from a user gesture, and the effect above runs after the render.
  const start = useCallback(
    (from: number) => {
      const moment = moments[from];
      if (!moment) return;
      const el = audio.current;
      if (el) {
        // A moment without a preview still plays a moment of silence here,
        // so the songs after it are allowed to start on their own.
        el.src = moment.previewUrl ?? silence();
        el.currentTime = 0;
        loadedFor.current = moment.id;
        playOrStop(el, () => setPlaying(false));
      }
      setStarted(true);
      setPlaying(true);
      setFinished(false);
      setProgress(0);
      if (from !== index) {
        setPrevious(index);
        setIndex(from);
      }
    },
    [index, moments]
  );

  const playFrom = (i: number) => {
    start(i);
    stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggle = useCallback(() => {
    if (!started || finished) return start(finished ? 0 : index);
    setPlaying((p) => {
      const el = audio.current;
      if (el && current?.previewUrl) {
        if (p) el.pause();
        else playOrStop(el, () => setPlaying(false));
      }
      return !p;
    });
  }, [current, finished, index, start, started]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      // Before the show starts, Space scrolls the page as usual.
      if (e.key === " " && started && !t?.closest("button, a")) {
        e.preventDefault();
        if (!e.repeat) toggle();
      } else if (e.key === "ArrowRight" && started) go(index + 1);
      else if (e.key === "ArrowLeft" && started) go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, started, toggle]);

  // One moment's own link (it opens only that moment): the share sheet where
  // there is one, else the clipboard.
  async function shareMoment(m: KeepsakeMoment) {
    if (!shareSlug || !m.shareSig) return;
    const url = momentLink(shareSlug, m.id, m.shareSig);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${m.guestName} picked ${m.title}`, text: `From ${names}'s guest book`, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(m.id);
      setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 2500);
    } catch {
      // Nothing more to try; the button just doesn't confirm.
    }
  }

  const shown = started ? current : cover;
  const below = started && previous !== null && previous !== index ? moments[previous] : null;

  return (
    <div className={k.book}>
      {preview ? (
        <div className={k.previewBar}>
          <span>{preview.note}</span>
          <Link href={preview.backHref}>Back to your wedding</Link>
        </div>
      ) : null}

      <section ref={stage} className={k.stage} aria-label={started ? "Now playing" : names}>
        <div className={k.layers} aria-hidden="true">
          {below ? <Backdrop moment={below} /> : null}
          {shown ? <Backdrop key={shown.id} moment={shown} entering={started} /> : null}
        </div>

        <header className={k.top}>
          <Link href="/" className={k.wordmark}>
            Soundtracks
          </Link>
          {started && total ? (
            <span className={k.count}>
              {index + 1} of {total}
            </span>
          ) : null}
        </header>

        {!started || finished ? (
          <div className={k.intro}>
            <h1 className={k.names}>{names}</h1>
            <p className={k.meta}>{when}</p>
            <p className={k.summary}>{finished ? `That was the night. ${summary}.` : total ? `${summary}.` : "No songs yet."}</p>
            {total ? (
              <div className={k.introActions}>
                <button type="button" className={k.play} onClick={() => start(0)}>
                  <PlayIcon />
                  {finished ? "Play it again" : "Play the night"}
                </button>
                <a className={k.quiet} href="#tracklist">
                  See every song
                </a>
              </div>
            ) : null}
          </div>
        ) : current ? (
          <div className={k.now} key={current.id}>
            <p className={k.song}>
              <strong>{current.title}</strong> <span>{current.artist}</span>
            </p>
            {current.words ? (
              <blockquote className={k.words} tabIndex={0} aria-label={`${current.guestName} wrote`}>
                {current.words}
              </blockquote>
            ) : null}
            <p className={k.by}>
              {current.guestName} · {current.when}
            </p>
            <div className={k.controls}>
              <button type="button" className={k.control} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous moment">
                <PrevIcon />
              </button>
              <button type="button" className={`${k.control} ${k.main}`} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button type="button" className={k.control} onClick={() => go(index + 1)} disabled={index + 1 >= total} aria-label="Next moment">
                <NextIcon />
              </button>
              {shareSlug && current.shareSig ? (
                <button type="button" className={k.share} onClick={() => shareMoment(current)} aria-live="polite">
                  <ShareIcon />
                  {copied === current.id ? "Link copied" : "Share"}
                </button>
              ) : null}
              {!current.previewUrl ? <span className={k.noPreview}>No preview for this song</span> : null}
            </div>
          </div>
        ) : null}

        {started ? (
          <div className={k.progress} aria-hidden="true">
            <span style={{ transform: `scaleX(${finished ? 1 : progress})` }} />
          </div>
        ) : null}
        <audio
          ref={audio}
          preload="auto"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration) setProgress(el.currentTime / el.duration);
          }}
          onEnded={(e) => {
            // The unlocking silence ending isn't a song ending.
            if (!e.currentTarget.src.startsWith("data:")) advance();
          }}
          onError={(e) => {
            // An expired or missing preview: skip ahead rather than stall.
            // Cancelled if the listener moves first (the effect clears it).
            if (!started || !playing || !current?.previewUrl || e.currentTarget.src.startsWith("data:")) return;
            if (skipTimer.current) clearTimeout(skipTimer.current);
            skipTimer.current = setTimeout(advance, 1500);
          }}
        />
      </section>

      <section className={k.notes} id="tracklist" aria-labelledby="tracklist-title">
        <div className={k.notesInner}>
          <h2 id="tracklist-title" className={k.notesTitle}>
            {names}
          </h2>
          <p className={k.notesMeta}>
            {when}
            {total ? ` · ${summary}` : ""}
          </p>
          {picked.length ? (
            <p className={k.picked}>
              Picked more than once:{" "}
              {picked.slice(0, 5).map((p, i) => (
                <span key={p.appleMusicId || p.title}>
                  {i ? ", " : ""}
                  <strong>{p.title}</strong> ({p.count})
                </span>
              ))}
            </p>
          ) : null}
          <ol className={k.tracks}>
            {moments.map((m, i) => {
              const thumb = m.photoUrl ?? artworkAt(m.artworkUrl, 200);
              const isCurrent = started && i === index;
              return (
                <li key={m.id} className={k.track}>
                  <button type="button" className={k.trackButton} onClick={() => playFrom(i)} aria-current={isCurrent ? "true" : undefined}>
                    <span className={k.trackNo}>{isCurrent ? <span className={k.dot} aria-hidden="true" /> : i + 1}</span>
                    {thumb ? <img className={k.thumb} src={thumb} alt="" loading="lazy" decoding="async" /> : <span className={k.thumb} />}
                    <span className={k.trackText}>
                      <span className={k.trackSong}>
                        <strong>{m.title}</strong> <span>{m.artist}</span>
                      </span>
                      {m.words ? <span className={k.trackWords}>{m.words}</span> : null}
                      <span className={k.trackBy}>
                        {m.guestName} · {m.when}
                      </span>
                    </span>
                    <span className="sr-only">Play from here</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className={k.footer}>
            <Link href="/weddings">Soundtracks</Link>: a guest book that plays.
          </p>
        </div>
      </section>
    </div>
  );
}

/** The photo, or for a song-only moment its artwork over a wash of itself. */
export function Backdrop({ moment, entering = false }: { moment: KeepsakeMoment; entering?: boolean }) {
  const cls = `${k.layer} ${entering ? k.entering : ""}`;
  if (moment.photoUrl) {
    return (
      <div className={cls}>
        <img className={k.photo} src={moment.photoUrl} alt="" />
      </div>
    );
  }
  const art = artworkAt(moment.artworkUrl, 1200);
  return (
    <div className={`${cls} ${k.songOnly}`}>
      {art ? (
        <>
          <img className={k.wash} src={art} alt="" />
          <img className={k.art} src={art} alt="" />
        </>
      ) : null}
    </div>
  );
}

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
  </svg>
);
export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </svg>
);
const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M18 6.3v11.4a.9.9 0 0 1-1.38.76L8.5 13.2v4.3a1 1 0 0 1-2 0v-11a1 1 0 0 1 2 0v4.3l8.12-5.26A.9.9 0 0 1 18 6.3Z" fill="currentColor" />
  </svg>
);
const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M6 6.3v11.4a.9.9 0 0 0 1.38.76l8.12-5.26v4.3a1 1 0 0 0 2 0v-11a1 1 0 0 0-2 0v4.3L7.38 5.54A.9.9 0 0 0 6 6.3Z" fill="currentColor" />
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M12 3v12M12 3l-4 4M12 3l4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
