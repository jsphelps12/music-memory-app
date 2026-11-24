import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { signedVoiceUrl } from "@/lib/voiceStorage";
import { friendlyError } from "@/lib/errors";
import type { VoiceClip } from "@/lib/voice";

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

interface Options {
  /**
   * Plays over the song instead of taking turns with it (the film, 1.5): it
   * doesn't pause the song, and the song starting doesn't stop it. The
   * caller turns the song down (lib/audioMix.ts).
   */
  overSong?: boolean;
  /** The recording played to its end. */
  onFinish?: () => void;
}

/**
 * Plays a voice recording (lib/voice.ts): a take on the phone, or a stored
 * one through a signed URL fetched on first play. Its own expo-audio player,
 * separate from the song's (contexts/PlayerContext.tsx). On the moment and in
 * the recorder sheet:
 * - starting the voice pauses the song. A preview could be turned down
 *   under it, but full Apple Music playback can't be ducked (see the
 *   PlayerContext duck comment), so the song pauses either way;
 * - the song starting stops the voice.
 * In the film (`overSong`) the two play together and the film ducks the song
 * (hooks/useFilmVoice.ts). Either way:
 * - a pause while the recording is still loading wins: it won't start late;
 * - unmounting stops it, and the player is released with the component (a
 *   moment detail page remounts on every flip, so a flip stops it too).
 */
export function useVoicePlayer(clip: VoiceClip | null, { overSong = false, onFinish }: Options = {}) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const { isPlaying: songPlaying, pause: pauseSong } = usePlayerControls();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Which recording the player has loaded, by its uri or path. State, not a
  // ref: render reads it (the React Compiler skips components that read refs
  // in render).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = clip ? (clip.kind === "local" ? clip.uri : clip.path) : null;
  // Bumped by every play and pause, so a play still fetching its link can
  // tell it's been overtaken. Only read in handlers.
  const playGen = useRef(0);

  const pause = useCallback(() => {
    playGen.current += 1;
    setLoading(false);
    try {
      player.pause();
    } catch {}
  }, [player]);

  /** Back to the top, ready to play from the start (a fresh opening of the film). */
  const rewind = useCallback(() => {
    try {
      void player.seekTo(0).catch(() => {});
    } catch {}
  }, [player]);

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

  // Played to its end.
  const finished = useEffectEvent(() => onFinish?.());
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) finished();
    });
    return () => sub.remove();
  }, [player]);

  // Leaving: stop before the player is released.
  useEffect(() => () => pause(), [pause]);

  const play = async (): Promise<VoicePlayResult> => {
    if (!clip || !key) return "failed";
    const gen = ++playGen.current;
    const current = () => gen === playGen.current;
    setError("");
    if (songPlaying && !overSong) pauseSong();
    const load = loadedKey !== key;
    const fromTop = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (load) setLoading(true);
    let result: VoicePlayResult;
    try {
      result = await startPlayback(player, clip, load, fromTop, current);
    } catch (e) {
      result = current() ? "failed" : "cancelled";
      if (result === "failed") setError(friendlyError(e));
    }
    if (result === "started" && load) setLoadedKey(key);
    if (current()) setLoading(false);
    return result;
  };

  const loaded = loadedKey === key;
  const durationMs = loaded && status.duration > 0 ? status.duration * 1000 : clip?.durationMs ?? 0;
  return {
    playing: loaded && status.playing,
    loading,
    error,
    /** Where playback is, in ms (0 before it has played). */
    positionMs: loaded ? status.currentTime * 1000 : 0,
    durationMs,
    play,
    pause,
    rewind,
    toggle: () => (status.playing ? pause() : void play()),
  };
}
