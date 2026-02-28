"use client";

import { useRef, useState } from "react";

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
      audio.play();
      setPlaying(true);
    }
  };

  return (
    <div className="mt-4 flex items-center gap-3">
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ backgroundColor: "#E8825C", color: "#fff" }}
      >
        {playing ? (
          <>
            <span style={{ fontSize: 12 }}>■</span> Stop preview
          </>
        ) : (
          <>
            <span style={{ fontSize: 12 }}>▶</span> Play preview
          </>
        )}
      </button>
      <span className="text-xs" style={{ color: "#999" }}>30s preview</span>
    </div>
  );
}
