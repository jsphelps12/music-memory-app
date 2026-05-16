import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { Audio } from "expo-av";
import { Song } from "@/types";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  playError: boolean;
  play: (song: Song, previewUrl: string) => void;
  pause: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const play = useCallback(async (song: Song, previewUrl: string) => {
    await unloadSound();
    setPlayError(false);
    try {
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
    } catch {
      setIsPlaying(false);
      setCurrentSong(null);
      setPlayError(true);
    }
  }, [unloadSound]);

  const pause = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
      }
    } catch {}
    setIsPlaying(false);
  }, []);

  const stop = useCallback(async () => {
    await unloadSound();
    setCurrentSong(null);
    setIsPlaying(false);
    setPlayError(false);
  }, [unloadSound]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
    });
    return () => {
      unloadSound();
    };
  }, []);

  const contextValue = useMemo(
    () => ({ currentSong, isPlaying, playError, play, pause, stop }),
    [currentSong, isPlaying, playError, play, pause, stop]
  );

  return (
    <PlayerContext.Provider value={contextValue}>
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
