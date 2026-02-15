import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from "react";
import { Audio } from "expo-av";
import { Song } from "@/types";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  play: (song: Song, previewUrl: string) => void;
  pause: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  }, []);

  const play = useCallback(async (song: Song, previewUrl: string) => {
    await unloadSound();

    const { sound } = await Audio.Sound.createAsync(
      { uri: previewUrl },
      { shouldPlay: true }
    );
    soundRef.current = sound;
    setCurrentSong(song);
    setIsPlaying(true);

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setIsPlaying(false);
        setCurrentSong(null);
        unloadSound();
      }
    });
  }, [unloadSound]);

  const pause = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
    }
    setIsPlaying(false);
  }, []);

  const stop = useCallback(async () => {
    await unloadSound();
    setCurrentSong(null);
    setIsPlaying(false);
  }, [unloadSound]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
    });
    return () => {
      unloadSound();
    };
  }, []);

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
