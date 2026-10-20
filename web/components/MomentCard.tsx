"use client";

import { useState } from "react";
import { PauseIcon, PlayIcon, formatMomentDate, moodLabel } from "./Share";
import s from "./share.module.css";

interface MomentCardProps {
  index?: number;
  artworkUrl: string | null;
  songTitle: string;
  songArtist: string;
  reflection: string | null;
  contributorName: string | null;
  momentDate: string | null;
  photoUrls: string[];
  mood: string | null;
  isPlaying: boolean;
  hasPreview: boolean;
  onPlayPause: () => void;
}

// Long entries (the full-page writer) fold to six lines with a way to open
// them, so one essay doesn't bury the rest of the album.
const FOLD_AT = 420;

/** One entry in a tracklist: artwork (tap to play), song then artist, the
 *  contributor's words in the reading face, photos, then a meta line. */
export default function MomentCard({
  index,
  artworkUrl,
  songTitle,
  songArtist,
  reflection,
  contributorName,
  momentDate,
  photoUrls,
  mood,
  isPlaying,
  hasPreview,
  onPlayPause,
}: MomentCardProps) {
  const [open, setOpen] = useState(false);
  const long = !!reflection && reflection.length > FOLD_AT;
  const meta = [contributorName, formatMomentDate(momentDate)].filter(Boolean).join(" · ");
  const moodWord = moodLabel(mood);

  return (
    <li className={`${s.track} ${index === undefined ? s.unnumbered : ""}`}>
      {index !== undefined && <span className={s.trackNo}>{index}</span>}

      <div className={s.art}>
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" loading="lazy" />
        ) : (
          <div className={s.artBlank} />
        )}
        {hasPreview && (
          <button
            type="button"
            onClick={onPlayPause}
            className={`${s.play} ${isPlaying ? s.playing : ""}`}
            aria-label={isPlaying ? `Pause ${songTitle}` : `Play a preview of ${songTitle}`}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>
        )}
      </div>

      <div className={s.trackBody}>
        <p className={`${s.trackSong} ${s.oneLine}`}>
          <span className={s.song}>{songTitle}</span> <span className={s.artist}>{songArtist}</span>
        </p>

        {reflection && (
          <>
            <p className={`${s.trackText} ${long && !open ? s.clamped : ""}`}>{reflection}</p>
            {long && (
              <button type="button" className={`${s.quietButton} ${s.more}`} onClick={() => setOpen(!open)}>
                {open ? "Show less" : "Read all"}
              </button>
            )}
          </>
        )}

        {photoUrls.length > 0 && (
          <div className={s.strip}>
            {photoUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`Photo ${i + 1}`} loading="lazy" />
            ))}
          </div>
        )}

        {(meta || moodWord) && (
          <p className={`${s.meta} ${s.trackMeta}`}>
            {meta}
            {meta && moodWord ? " · " : ""}
            {moodWord && <span className={s.mood}>{moodWord}</span>}
          </p>
        )}
      </div>
    </li>
  );
}
