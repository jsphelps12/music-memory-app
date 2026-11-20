"use client";

import { useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/Share";
import m from "./moment.module.css";

type PlayState = "idle" | "loading" | "playing" | "paused" | "error";

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The song's 30-second preview, played on the page: no account, no app, no
 * redirect to a streaming service. Nothing loads until the first tap
 * (preload="none"), so opening the link on cellular costs nothing extra.
 */
export function Preview({
  url,
  title,
  artist,
  artwork,
}: {
  url: string;
  title: string;
  artist: string | null;
  artwork: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<PlayState>("idle");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(30);

  const playing = state === "playing" || state === "loading";

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    setState("loading");
    // Lock Screen and Control Center show the song while it plays.
    if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist ?? undefined,
        artwork: artwork ? [{ src: artwork, sizes: "600x600", type: "image/jpeg" }] : [],
      });
    }
    audio.play().catch((e: unknown) => {
      // A pause before playback started rejects with AbortError: not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setState("error");
    });
  };

  if (state === "error") {
    return (
      <div className={m.player}>
        <p className={m.playerNote}>The preview isn&rsquo;t available right now.</p>
      </div>
    );
  }

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  const started = state !== "idle";

  return (
    <div className={m.player}>
      <audio
        ref={audioRef}
        src={url}
        preload="none"
        onPlaying={() => setState("playing")}
        onWaiting={() => setState("loading")}
        onPause={(e) => {
          if (!e.currentTarget.ended) setState("paused");
        }}
        onEnded={() => {
          setState("idle");
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => setState("error")}
      />
      <button type="button" onClick={toggle} className={m.playButton} aria-pressed={playing} aria-describedby="preview-note">
        {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        <span>{playing ? "Pause" : started ? "Resume" : "Play preview"}</span>
      </button>
      <div className={m.track} aria-hidden="true">
        <div className={m.trackFill} data-playing={playing || undefined} style={{ transform: `scaleX(${progress})` }} />
      </div>
      <span className={m.time} aria-hidden="true">
        {started ? clock(time) : clock(duration)}
      </span>
      <span id="preview-note" className={m.visuallyHidden}>
        A 30-second preview of the song.
      </span>
    </div>
  );
}
