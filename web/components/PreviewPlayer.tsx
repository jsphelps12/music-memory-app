"use client";

import { useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "./Share";
import s from "./share.module.css";

export function PreviewPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    }
  };

  return (
    <div className={s.player}>
      <audio ref={audioRef} src={url} preload="none" onEnded={() => setPlaying(false)} />
      <button type="button" onClick={toggle} className={s.pill} aria-pressed={playing}>
        {playing ? <PauseIcon /> : <PlayIcon />}
        {playing ? "Pause" : "Play preview"}
      </button>
      <span className={s.meta}>30-second preview</span>
    </div>
  );
}
