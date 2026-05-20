"use client";

import { useRef, useState } from "react";
import MomentCard from "./MomentCard";

export interface MomentItem {
  id: string;
  songTitle: string;
  songArtist: string;
  artworkUrl: string | null;
  reflection: string | null;
  momentDate: string | null;
  previewUrl: string | null;
  photoUrls: string[];
  contributorName: string | null;
  mood: string | null;
}

export default function CollectionMomentList({ moments }: { moments: MomentItem[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handlePlayPause(moment: MomentItem) {
    const audio = audioRef.current;
    if (!audio || !moment.previewUrl) return;

    if (playingId === moment.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = moment.previewUrl;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setPlayingId(moment.id);
  }

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onPause={() => {
          if (audioRef.current?.ended === false) setPlayingId(null);
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {moments.map((moment) => (
          <MomentCard
            key={moment.id}
            artworkUrl={moment.artworkUrl}
            songTitle={moment.songTitle}
            songArtist={moment.songArtist}
            reflection={moment.reflection}
            contributorName={moment.contributorName}
            momentDate={moment.momentDate}
            photoUrls={moment.photoUrls}
            mood={moment.mood}
            isPlaying={playingId === moment.id}
            hasPreview={!!moment.previewUrl}
            onPlayPause={() => handlePlayPause(moment)}
          />
        ))}
      </div>
    </>
  );
}
