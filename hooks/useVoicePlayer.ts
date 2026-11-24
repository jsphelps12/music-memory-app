import { useEffect, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { signedVoiceUrl } from "@/lib/voiceStorage";
import { friendlyError } from "@/lib/errors";
import type { VoiceClip } from "@/lib/voice";

/**
 * Load the recording if the player doesn't have it yet (a stored one through
 * a signed URL), go back to the top if it played to the end, and play.
 */
async function startPlayback(player: AudioPlayer, clip: VoiceClip, load: boolean, fromTop: boolean): Promise<void> {
  if (load) {
    const uri = clip.kind === "local" ? clip.uri : await signedVoiceUrl(clip.path);
    player.replace({ uri });
  } else if (fromTop) {
    await player.seekTo(0);
  }
  player.play();
}

/**
 * Plays a voice recording (lib/voice.ts): a take on the phone, or a stored
 * one through a signed URL fetched on first play. Its own expo-audio player,
 * separate from the song's (contexts/PlayerContext.tsx):
 * - starting the voice pauses the song. A preview could be turned down
 *   under it, but full Apple Music playback can't be ducked (see the
 *   PlayerContext duck comment), so the song pauses either way;
 * - the song starting stops the voice;
 * - unmounting stops it, and the player is released with the component (a
 *   moment detail page remounts on every flip, so a flip stops it too).
 */
export function useVoicePlayer(clip: VoiceClip | null) {
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

  // A different recording (recorded again, deleted): stop the old one.
  useEffect(() => {
    try {
      player.pause();
    } catch {}
    setError("");
  }, [key, player]);

  // The song started: the voice gives way.
  useEffect(() => {
    if (!songPlaying) return;
    try {
      player.pause();
    } catch {}
  }, [songPlaying, player]);

  // Leaving: stop before the player is released.
  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {}
    },
    [player]
  );

  const play = async () => {
    if (!clip || !key) return;
    setError("");
    if (songPlaying) pauseSong();
    const load = loadedKey !== key;
    const fromTop = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (load) setLoading(true);
    let started = false;
    try {
      await startPlayback(player, clip, load, fromTop);
      started = true;
    } catch (e) {
      setError(friendlyError(e));
    }
    if (started && load) setLoadedKey(key);
    setLoading(false);
  };

  const pause = () => {
    try {
      player.pause();
    } catch {}
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
    toggle: () => (status.playing ? pause() : void play()),
  };
}
