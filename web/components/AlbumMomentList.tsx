"use client";

import { useRef, useState } from "react";
import MomentCard from "./MomentCard";
import s from "./share.module.css";

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

export default function AlbumMomentList({
  moments,
  numbered = false,
}: {
  moments: MomentItem[];
  /** Number the rows like a record's tracklist (albums read oldest first). */
  numbered?: boolean;
}) {
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
    setPlayingId(moment.id);
    audio.play().catch(() => setPlayingId(null));
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
      <ol className={s.tracklist}>
        {moments.map((moment, i) => (
          <MomentCard
            key={moment.id}
            index={numbered ? i + 1 : undefined}
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
      </ol>
    </>
  );
}
