import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { Audio } from "expo-av";
import { Player, PlaybackStatus } from "@lomray/react-native-apple-music";
import type { ISong } from "@lomray/react-native-apple-music";
import { playAppleMusic, requestMusicAuthorization } from "@/lib/musickit";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const isNativeRef = useRef(false);
  const playGenRef = useRef(0);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  useEffect(() => {
    const stateSub = Player.addListener("onPlaybackStateChange", (state) => {
      if (!isNativeRef.current) return;
      const playing =
        state.playbackStatus === PlaybackStatus.PLAYING ||
        state.playbackStatus === PlaybackStatus.SEEKING_FORWARD ||
        state.playbackStatus === PlaybackStatus.SEEKING_BACKWARD;
      setIsPlaying(playing);
      if (state.playbackTime != null) setPlaybackTime(state.playbackTime);
      if (state.playbackStatus === PlaybackStatus.STOPPED) {
        setCurrentSong(null);
        setIsPlaying(false);
        setPlaybackTime(0);
        setPlaybackDuration(0);
        isNativeRef.current = false;
      }
    });

    const timeSub = Player.addListener("onPlaybackTimeUpdate", (data) => {
      if (!isNativeRef.current) return;
      setPlaybackTime(data.playbackTime);
    });

    const songSub = Player.addListener("onCurrentSongChange", (song: ISong) => {
      if (!isNativeRef.current) return;
      if (song.duration) setPlaybackDuration(song.duration);
    });

    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    return () => {
      stateSub.remove();
      timeSub.remove();
      songSub.remove();
      unloadSound();
    };
  }, [unloadSound]);

  const playPreview = useCallback(async (song: Song, previewUrl: string) => {
    await unloadSound();
    isNativeRef.current = false;
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
  }, [unloadSound]);

  const playFull = useCallback(async (song: Song, previewUrl?: string) => {
    const gen = ++playGenRef.current;
    await unloadSound();
    if (isNativeRef.current) {
      try { Player.pause(); } catch {}
      isNativeRef.current = false;
    }
    setPlayError(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);

    if (!song.appleMusicId) {
      if (gen !== playGenRef.current) return;
      if (previewUrl) await playPreview(song, previewUrl);
      else { setCurrentSong(null); setPlayError(true); }
      return;
    }

    const authorized = await requestMusicAuthorization();
    if (!authorized) {
      if (gen !== playGenRef.current) return;
      if (previewUrl) await playPreview(song, previewUrl);
      else { setCurrentSong(null); setPlayError(true); }
      return;
    }

    try {
      const durationSecs = await playAppleMusic(song.appleMusicId);
      if (gen !== playGenRef.current) return;
      isNativeRef.current = true;
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPreview(false);
      setPlaybackDuration(durationSecs);
    } catch {
      if (gen !== playGenRef.current) return;
      isNativeRef.current = false;
      if (previewUrl) {
        await playPreview(song, previewUrl);
      } else {
        setCurrentSong(null);
        setIsPlaying(false);
        setPlayError(true);
      }
    }
  }, [playPreview, unloadSound]);

  const pause = useCallback(() => {
    if (isNativeRef.current) {
      try { Player.pause(); } catch {}
    } else if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (isNativeRef.current) {
      try { Player.play(); } catch {}
    } else if (soundRef.current) {
      soundRef.current.playAsync().catch(() => {});
    }
    setIsPlaying(true);
  }, []);

  const stop = useCallback(async () => {
    if (isNativeRef.current) {
      try { Player.pause(); } catch {}
      isNativeRef.current = false;
    }
    await unloadSound();
    setCurrentSong(null);
    setIsPlaying(false);
    setIsPreview(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    setPlayError(false);
  }, [unloadSound]);

  const seekTo = useCallback((seconds: number) => {
    if (isNativeRef.current) {
      Player.seekToTime(seconds);
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
