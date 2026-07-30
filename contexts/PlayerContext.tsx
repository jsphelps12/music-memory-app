import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { Audio } from "expo-av";
import { getProvider } from "@/lib/providers";
import type { MusicProvider } from "@/lib/providers";
import { Song } from "@/types";

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  isPreview: boolean;
  playbackTime: number;
  playbackDuration: number;
  playError: boolean;
  playFull: (song: Song, previewUrl?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [playError, setPlayError] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // expo-av Sound ref — used only for 30-sec preview fallback playback
  const soundRef = useRef<Audio.Sound | null>(null);
  // Tracks which provider is currently driving full playback (null = preview or stopped)
  const activeProviderRef = useRef<MusicProvider | null>(null);
  // Unsubscribe function for the active provider's state listener
  const providerUnsubRef = useRef<(() => void) | null>(null);
  // Generation counter to discard stale playback requests
  const playGenRef = useRef(0);

  useEffect(() => {
    // Fire-and-forget: if the audio session can't be configured, preview
    // playback still works, it just won't play through the silent switch.
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    return () => {
      unloadSound();
      providerUnsubRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const stopProvider = useCallback(() => {
    if (activeProviderRef.current) {
      activeProviderRef.current.stop();
      providerUnsubRef.current?.();
      providerUnsubRef.current = null;
      activeProviderRef.current = null;
    }
  }, []);

  const playPreview = useCallback(async (song: Song, previewUrl: string) => {
    await unloadSound();
    stopProvider();
    setPlayError(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: previewUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPreview(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.positionMillis != null) setPlaybackTime(status.positionMillis / 1000);
        if (status.durationMillis) setPlaybackDuration(status.durationMillis / 1000);
        if (status.didJustFinish) {
          setIsPlaying(false);
          setCurrentSong(null);
          setPlaybackTime(0);
          setPlaybackDuration(0);
          unloadSound();
        }
      });
    } catch {
      setIsPlaying(false);
      setCurrentSong(null);
      setPlayError(true);
    }
  }, [unloadSound, stopProvider]);

  const playFull = useCallback(async (song: Song, previewUrl?: string) => {
    const gen = ++playGenRef.current;
    await unloadSound();
    stopProvider();
    setPlayError(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);

    const provider = getProvider(song.provider);
    const authorized = await provider.authorize();

    if (gen !== playGenRef.current) return;

    if (!authorized) {
      if (previewUrl) await playPreview(song, previewUrl);
      else { setCurrentSong(null); setPlayError(true); }
      return;
    }

    try {
      await provider.play(song);
      if (gen !== playGenRef.current) return;

      activeProviderRef.current = provider;
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPreview(false);

      providerUnsubRef.current = provider.onStateChange((state) => {
        if (activeProviderRef.current !== provider) return;
        setIsPlaying(state.isPlaying);
        if (state.positionMs > 0) setPlaybackTime(state.positionMs / 1000);
        if (state.durationMs > 0) setPlaybackDuration(state.durationMs / 1000);
        if (!state.isPlaying && state.positionMs === 0 && state.durationMs === 0) {
          // Playback stopped (track ended or SDK disconnected)
          setCurrentSong(null);
          setIsPlaying(false);
          setPlaybackTime(0);
          setPlaybackDuration(0);
          activeProviderRef.current = null;
          providerUnsubRef.current = null;
        }
      });
    } catch {
      if (gen !== playGenRef.current) return;
      activeProviderRef.current = null;
      if (previewUrl) {
        await playPreview(song, previewUrl);
      } else {
        setCurrentSong(null);
        setIsPlaying(false);
        setPlayError(true);
      }
    }
  }, [playPreview, unloadSound, stopProvider]);

  const pause = useCallback(() => {
    if (activeProviderRef.current) {
      activeProviderRef.current.pause();
    } else if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (activeProviderRef.current) {
      activeProviderRef.current.resume();
    } else if (soundRef.current) {
      soundRef.current.playAsync().catch(() => {});
    }
    setIsPlaying(true);
  }, []);

  const stop = useCallback(async () => {
    stopProvider();
    await unloadSound();
    setCurrentSong(null);
    setIsPlaying(false);
    setIsPreview(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    setPlayError(false);
  }, [stopProvider, unloadSound]);

  const seekTo = useCallback((seconds: number) => {
    if (activeProviderRef.current) {
      activeProviderRef.current.seekTo(seconds);
    } else if (soundRef.current) {
      soundRef.current.setPositionAsync(seconds * 1000).catch(() => {});
    }
    setPlaybackTime(seconds);
  }, []);

  const contextValue = useMemo(
    () => ({ currentSong, isPlaying, isPreview, playbackTime, playbackDuration, playError, playFull, pause, resume, stop, seekTo }),
    [currentSong, isPlaying, isPreview, playbackTime, playbackDuration, playError, playFull, pause, resume, stop, seekTo]
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
