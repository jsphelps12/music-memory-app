import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { clearVoiceUrlCache, signedVoiceUrl } from "@/lib/voiceStorage";
import { friendlyError } from "@/lib/errors";
import {
  VOICE_LOAD_TIMEOUT_MS,
  VOICE_PLAYBACK_IDLE,
  nextVoicePlayback,
  voiceNeedsLoad,
  type LoadedVoice,
  type VoiceClip,
  type VoicePlayback,
} from "@/lib/voice";

/** How a play() call came out: playing, stopped by a pause while it loaded, or couldn't be had. */
export type VoicePlayResult = "started" | "cancelled" | "failed";

/**
 * Load the recording if the player doesn't have it yet (a stored one through
 * a signed URL), go back to the top if it played to the end, and play.
 * `current` says whether this call still stands: a pause while the link was
 * being fetched wins, so the recording never starts after it.
 */
async function startPlayback(
  player: AudioPlayer,
  clip: VoiceClip,
  load: boolean,
  fromTop: boolean,
  current: () => boolean
): Promise<"started" | "cancelled"> {
  if (load) {
    const uri = clip.kind === "local" ? clip.uri : await signedVoiceUrl(clip.path);
    if (!current()) return "cancelled";
    player.replace({ uri });
  } else if (fromTop) {
    await player.seekTo(0);
    if (!current()) return "cancelled";
  }
  player.play();
  return "started";
}

/** A message for a playback that failed, never empty. */
function playbackError(cause: unknown): string {
  return friendlyError(cause) || friendlyError(null);
}

interface Options {
  /**
   * Plays over the song instead of taking turns with it (the film, 1.5): it
   * doesn't pause the song, and the song starting doesn't stop it. The
   * caller turns the song down (lib/audioMix.ts). It shows no progress, so
   * only playing or not re-renders, never the position ticking along.
   */
  overSong?: boolean;
  /** The recording played to its end. */
  onFinish?: () => void;
}

/**
 * Plays a voice recording (lib/voice.ts): a take on the phone, or a stored
 * one through a signed URL fetched on first play. Its own expo-audio player,
 * separate from the song's (contexts/PlayerContext.tsx), made on the first
 * play (a film page or a recorder sheet that's never played makes none) and
 * released with the component. On the moment and in the recorder sheet:
 * - starting the voice pauses the song. A preview could be turned down
 *   under it, but full Apple Music playback can't be ducked (see the
 *   PlayerContext duck comment), so the song pauses either way;
 * - the song starting stops the voice.
 * In the film (`overSong`) the two play together and the film ducks the song
 * (hooks/useFilmVoice.ts). Either way:
 * - a pause while the recording is still loading wins: it won't start late;
 * - a recording that fails to load or play (offline, a link that won't
 *   load), or isn't heard within VOICE_LOAD_TIMEOUT_MS, says so (`error`)
 *   and the next play loads it afresh with a new signed URL. A stored one
 *   loaded long enough ago that its link may have lapsed is loaded again too;
 * - unmounting stops it, and the player is released with the component (a
 *   moment detail page remounts on every flip, so a flip stops it too).
 */
export function useVoicePlayer(clip: VoiceClip | null, { overSong = false, onFinish }: Options = {}) {
  const { isPlaying: songPlaying, pause: pauseSong } = usePlayerControls();
  const [seen, setSeen] = useState<VoicePlayback>(VOICE_PLAYBACK_IDLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Which recording the player has loaded (by its uri or path) and when.
  // State, not a ref: render reads it (the React Compiler skips components
  // that read refs in render).
  const [loaded, setLoaded] = useState<LoadedVoice | null>(null);
  // A play has started and isn't heard yet: it fails if that lasts.
  const [waiting, setWaiting] = useState(false);
  const key = clip ? (clip.kind === "local" ? clip.uri : clip.path) : null;
  // Bumped by every play, pause and failure, so a play still fetching its
  // link can tell it's been overtaken. Only read in handlers.
  const playGen = useRef(0);
  // The player, made on first play. Only touched in handlers and effects.
  const live = useRef<{ player: AudioPlayer; sub: { remove(): void } } | null>(null);
  // The status handler as of the latest render (the player's listener calls
  // through it, so it never sees stale options).
  const onStatus = useRef<(s: AudioStatus) => void>(() => {});

  const pause = useCallback(() => {
    playGen.current += 1;
    setLoading(false);
    setWaiting(false);
    try {
      live.current?.player.pause();
    } catch {}
  }, []);

  /** A load or playback failure: stop, forget what's loaded, and say so. */
  const fail = useCallback((cause: unknown) => {
    playGen.current += 1;
    try {
      live.current?.player.pause();
    } catch {}
    setLoaded(null);
    setLoading(false);
    setWaiting(false);
    // The next play asks for a fresh signed URL, not the cached one.
    clearVoiceUrlCache();
    setError(playbackError(cause));
  }, []);

  /** Back to the top, ready to play from the start (a fresh opening of the film). */
  const rewind = useCallback(() => {
    try {
      void live.current?.player.seekTo(0).catch(() => {});
    } catch {}
  }, []);

  useEffect(() => {
    onStatus.current = (s) => {
      setSeen((prev) => nextVoicePlayback(prev, s, !overSong));
      if (s.playing) setWaiting(false);
      if (s.didJustFinish) onFinish?.();
      if (s.error) fail(new Error(s.error));
    };
  });

  const getPlayer = () => {
    if (live.current) return live.current.player;
    const player = createAudioPlayer(null, { updateInterval: overSong ? 500 : 250 });
    const sub = player.addListener("playbackStatusUpdate", (s) => onStatus.current(s));
    live.current = { player, sub };
    return player;
  };

  // A different recording (recorded again, deleted): stop the old one.
  useEffect(() => {
    pause();
    setError("");
  }, [key, pause]);

  // The song started: the voice gives way (unless it plays over the song).
  useEffect(() => {
    if (!songPlaying || overSong) return;
    pause();
  }, [songPlaying, overSong, pause]);

  // Started but not heard for a while (no connection, a stream that won't
  // load): a failure, not a silent spinner.
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => fail(new Error("Timed out")), VOICE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting, fail]);

  // Leaving: stop, then release the player.
  useEffect(
    () => () => {
      playGen.current += 1;
      const held = live.current;
      live.current = null;
      if (!held) return;
      held.sub.remove();
      try {
        held.player.pause();
      } catch {}
      try {
        held.player.remove();
      } catch {}
    },
    []
  );

  const play = async (): Promise<VoicePlayResult> => {
    if (!clip || !key) return "failed";
    const gen = ++playGen.current;
    const current = () => gen === playGen.current;
    setError("");
    if (songPlaying && !overSong) pauseSong();
    let player: AudioPlayer;
    try {
      player = getPlayer();
    } catch (e) {
      setError(playbackError(e));
      return "failed";
    }
    const load = voiceNeedsLoad(loaded, key, clip.kind, Date.now());
    const fromTop = !load && player.duration > 0 && player.currentTime >= player.duration - 0.1;
    if (load) {
      setLoading(true);
      setSeen(VOICE_PLAYBACK_IDLE);
    }
    let result: VoicePlayResult;
    try {
      result = await startPlayback(player, clip, load, fromTop, current);
    } catch (e) {
      result = current() ? "failed" : "cancelled";
      if (result === "failed") {
        if (load) setLoaded(null);
        setError(playbackError(e));
      }
    }
    if (result === "started") {
      if (load) setLoaded({ key, at: Date.now() });
      setWaiting(true);
    }
    if (current()) setLoading(false);
    return result;
  };

  const isLoaded = !!loaded && loaded.key === key;
  const playing = isLoaded && seen.playing;
  return {
    playing,
    loading,
    error,
    /** Where playback is, in ms (0 before it has played). */
    positionMs: isLoaded ? seen.positionMs : 0,
    durationMs: isLoaded && seen.durationMs > 0 ? seen.durationMs : clip?.durationMs ?? 0,
    play,
    pause,
    rewind,
    toggle: () => (playing ? pause() : void play()),
  };
}
