import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
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
  playPreview: (song: Song, previewUrl: string) => Promise<void>;
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

  // expo-audio player ref — used only for 30-sec preview fallback playback
  const soundRef = useRef<AudioPlayer | null>(null);
  // Tracks which provider is currently driving full playback (null = preview or stopped)
  const activeProviderRef = useRef<MusicProvider | null>(null);
  // Unsubscribe function for the active provider's state listener
  const providerUnsubRef = useRef<(() => void) | null>(null);
  // Generation counter to discard stale playback requests
  const playGenRef = useRef(0);

  useEffect(() => {
    // Fire-and-forget: if the audio session can't be configured, preview
    // playback still works, it just won't play through the silent switch.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      unloadSound();
      providerUnsubRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        soundRef.current.pause();
        soundRef.current.remove();
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
      // expo-audio positions are SECONDS (expo-av's were ms) — no /1000 here.
      const player = createAudioPlayer({ uri: previewUrl });
      soundRef.current = player;
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPreview(true);

      player.addListener("playbackStatusUpdate", (status) => {
        if (status.currentTime != null) setPlaybackTime(status.currentTime);
        if (status.duration) setPlaybackDuration(status.duration);
        if (status.didJustFinish) {
          setIsPlaying(false);
          setCurrentSong(null);
          setPlaybackTime(0);
          setPlaybackDuration(0);
          unloadSound();
        }
      });
      player.play();
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
      try { soundRef.current.pause(); } catch {}
    }
    setIsPlaying(false);
  }, []);

  // Pause when the app leaves the foreground. This is a memories app, not a
  // music player — audio continuing after the user switches away reads as a
  // bug (beta feedback, 2026-07). Previews already stop on suspension (no
  // background audio mode configured), but provider playback drives the system player,
  // which would otherwise keep going indefinitely. "inactive" is deliberately
  // excluded: it fires on Control Center pulls and the app switcher peek,
  // where stopping would be wrong.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") pause();
    });
    return () => sub.remove();
  }, [pause]);

  const resume = useCallback(() => {
    if (activeProviderRef.current) {
      activeProviderRef.current.resume();
    } else if (soundRef.current) {
      try { soundRef.current.play(); } catch {}
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
      // expo-audio seeks in seconds (expo-av took ms)
      soundRef.current.seekTo(seconds).catch(() => {});
    }
    setPlaybackTime(seconds);
  }, []);

  const contextValue = useMemo(
    () => ({ currentSong, isPlaying, isPreview, playbackTime, playbackDuration, playError, playPreview, playFull, pause, resume, stop, seekTo }),
    [currentSong, isPlaying, isPreview, playbackTime, playbackDuration, playError, playPreview, playFull, pause, resume, stop, seekTo]
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
