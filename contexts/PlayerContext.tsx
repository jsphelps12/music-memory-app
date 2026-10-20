import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { getProvider } from "@/lib/providers";
import type { MusicProvider } from "@/lib/providers";
import { Song } from "@/types";

/**
 * What changes only on discrete events (a song starts, pauses, stops, fails).
 * Safe for list rows to subscribe to.
 */
interface PlayerControls {
  currentSong: Song | null;
  isPlaying: boolean;
  isPreview: boolean;
  playError: boolean;
  playPreview: (song: Song, previewUrl: string) => Promise<void>;
  playFull: (song: Song, previewUrl?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
}

/** Updates on every playback tick (0.5-1s). Only progress UI should read it. */
interface PlayerProgress {
  playbackTime: number;
  playbackDuration: number;
}

type PlayerState = PlayerControls & PlayerProgress;

// Two contexts so the per-tick progress updates re-render only the progress
// UI. With one context, every mounted MomentCard re-rendered on every tick.
const PlayerContext = createContext<PlayerControls | undefined>(undefined);
const PlayerProgressContext = createContext<PlayerProgress | undefined>(undefined);

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
  // Generation counter to discard stale playback requests. Every action that
  // changes what should be playing bumps it: playFull, playPreview, stop, and
  // pause while a playFull is still pending.
  const playGenRef = useRef(0);
  // Generation of the playFull still awaiting authorize()/play(), if any.
  const pendingFullGenRef = useRef<number | null>(null);

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
    // Supersedes any playFull still waiting on authorize()/play().
    const gen = ++playGenRef.current;
    pendingFullGenRef.current = null;
    await unloadSound();
    if (gen !== playGenRef.current) return;
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
    pendingFullGenRef.current = gen;
    await unloadSound();
    stopProvider();
    setPlayError(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);

    const provider = getProvider(song.provider);
    // Spotify is only ever signed into from Me → Music Service. Playback must
    // not start an OAuth sheet: moment detail autoplays, so an Apple Music user
    // opening a Spotify moment someone shared with them would get a Spotify
    // login popping up unprompted. Not signed in → straight to the preview.
    const authorized = await (song.provider === "spotify"
      ? provider.isAvailable()
      : provider.authorize()
    ).catch(() => false);

    if (gen !== playGenRef.current) return;

    // Moments saved without a preview (every Spotify moment before the iTunes
    // fallback) get one looked up on demand rather than failing outright.
    const fallbackToPreview = async () => {
      let url = previewUrl;
      if (!url) {
        try {
          url = (await provider.fetchPreviewUrl(song)) ?? undefined;
        } catch {
          url = undefined;
        }
      }
      if (gen !== playGenRef.current) return;
      if (url) {
        await playPreview(song, url);
      } else {
        pendingFullGenRef.current = null;
        setCurrentSong(null);
        setIsPlaying(false);
        setPlayError(true);
      }
    };

    if (!authorized) {
      await fallbackToPreview();
      return;
    }

    try {
      await provider.play(song);
      if (gen !== playGenRef.current) {
        // Stopped, paused or replaced by a preview while play() was in flight,
        // but the system player has started anyway: stop it. A newer playFull
        // replaces the queue itself, and stopping here could cut that one off.
        if (pendingFullGenRef.current === null) provider.stop();
        return;
      }
      pendingFullGenRef.current = null;

      activeProviderRef.current = provider;
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPreview(false);

      // The provider is a shared singleton, so a listener only counts while its
      // own unsubscribe is the current one. Anything else is orphaned.
      let unsub: (() => void) | null = null;
      unsub = provider.onStateChange((state) => {
        if (activeProviderRef.current !== provider) return;
        if (unsub && providerUnsubRef.current !== unsub) return;
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
          // Remove the native listeners as well, or they pile up on the singleton.
          providerUnsubRef.current?.();
          providerUnsubRef.current = null;
        }
      });
      if (activeProviderRef.current === provider) {
        providerUnsubRef.current = unsub;
      } else {
        // The synchronous seed emit already reported a stop.
        unsub();
      }
    } catch {
      if (gen !== playGenRef.current) return;
      activeProviderRef.current = null;
      // Free Spotify account, Spotify app missing, connect timed out: all land
      // here and degrade to the 30-second preview.
      await fallbackToPreview();
    }
  }, [playPreview, unloadSound, stopProvider]);

  const pause = useCallback(() => {
    // A playFull still waiting on authorize()/play() would otherwise start the
    // song after this pause, for example with the app already in the background.
    if (pendingFullGenRef.current !== null) {
      playGenRef.current++;
      pendingFullGenRef.current = null;
    }
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
    // Cancels a playFull still waiting on authorize()/play().
    playGenRef.current++;
    pendingFullGenRef.current = null;
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

  const controlsValue = useMemo<PlayerControls>(
    () => ({ currentSong, isPlaying, isPreview, playError, playPreview, playFull, pause, resume, stop, seekTo }),
    [currentSong, isPlaying, isPreview, playError, playPreview, playFull, pause, resume, stop, seekTo]
  );
  const progressValue = useMemo<PlayerProgress>(
    () => ({ playbackTime, playbackDuration }),
    [playbackTime, playbackDuration]
  );

  return (
    <PlayerContext.Provider value={controlsValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

/**
 * Playback state and actions without the per-tick progress. Use this in list
 * rows and anything else that doesn't draw a progress bar.
 */
export function usePlayerControls(): PlayerControls {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayerControls must be used within a PlayerProvider");
  }
  return context;
}

/** playbackTime and playbackDuration only. The caller re-renders on every tick. */
export function usePlayerProgress(): PlayerProgress {
  const context = useContext(PlayerProgressContext);
  if (context === undefined) {
    throw new Error("usePlayerProgress must be used within a PlayerProvider");
  }
  return context;
}

/**
 * Everything, progress included, so the caller re-renders on every playback
 * tick. Prefer usePlayerControls, with usePlayerProgress in a small child that
 * draws the progress.
 */
export function usePlayer(): PlayerState {
  const controls = usePlayerControls();
  const progress = usePlayerProgress();
  return useMemo(() => ({ ...controls, ...progress }), [controls, progress]);
}
