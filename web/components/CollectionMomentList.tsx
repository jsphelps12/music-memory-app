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
}

export default function CollectionMomentList({ moments }: { moments: MomentItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle(moment: MomentItem) {
    const audio = audioRef.current;

    if (expandedId === moment.id) {
      // Collapse — stop audio
      audio?.pause();
      setIsPlaying(false);
      setExpandedId(null);
      return;
    }

    // Switch to a different moment
    setExpandedId(moment.id);
    setIsPlaying(false);

    if (!audio) return;

    if (moment.previewUrl) {
      audio.src = moment.previewUrl;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay blocked — silently ignore
      });
    } else {
      audio.pause();
      audio.src = "";
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <div className="space-y-3">
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
            expanded={expandedId === moment.id}
            isPlaying={expandedId === moment.id && isPlaying}
            hasPreview={!!moment.previewUrl}
            onToggle={() => toggle(moment)}
          />
        ))}
      </div>
    </>
  );
}
