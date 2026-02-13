import React, { createContext, useContext, useState } from "react";
import { Song } from "@/types";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  play: (song: Song) => void;
  pause: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    // TODO: integrate with MusicKit playback
  };

  const pause = () => {
    setIsPlaying(false);
    // TODO: pause MusicKit playback
  };

  const stop = () => {
    setCurrentSong(null);
    setIsPlaying(false);
    // TODO: stop MusicKit playback
  };

  return (
    <PlayerContext.Provider value={{ currentSong, isPlaying, play, pause, stop }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
