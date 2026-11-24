import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { AppState } from "react-native";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { useVoicePlayer } from "@/hooks/useVoicePlayer";
import { createMixRestore, quietVoice } from "@/lib/audioMix";
import {
  VOICE_STALL_MS,
  voiceSounds,
  voiceStartInMs,
  type FilmVoicePhase,
} from "@/lib/filmPlayback";
import { setDuckOthers } from "@/modules/photos-video";
import type { VoiceClip } from "@/lib/voice";

/**
 * The owner's voice in the film (1.5, docs/PLAN-1.5.md decision 8): it plays
 * over the song with the song turned down. When it comes in, how long it
 * plays and when it gives way are in lib/filmPlayback.ts; this runs them.
 *
 * The song is ducked like it is under a clip's sound (lib/audioMix.ts): a
 * preview fades to DUCK_LEVEL, full Apple Music playback is ducked by iOS
 * ("duck others", modules/photos-video). If iOS refuses, the song pauses for
 * the voice and comes back when it ends (not after a close or a pause, as
 * for a clip). The duck happens once the voice is actually heard, and is
 * held in its own MixRestore, given back through quietVoice() (voice first,
 * then the song) on every way out: the voice ending or being dropped, Pause,
 * closing, the app going to the background, the voice turned off, a clip's
 * sound turned on, unmount. A recording that can't be had (offline, a failed
 * signed URL) is dropped without a word and the film plays as it always has.
 */
export function useFilmVoice({
  voicePath,
  voiceDurationMs,
  visible,
  paused,
  clipSoundOn,
  songPlaying,
  startSong,
  pauseSong,
}: {
  /** The recording's path, or null: none, someone else's moment, or not a film (lib/filmPlayback.ts filmPlaysVoice). */
  voicePath: string | null;
  voiceDurationMs: number;
  visible: boolean;
  paused: boolean;
  /** A clip's own sound is on: the voice waits for it. */
  clipSoundOn: boolean;
  songPlaying: boolean;
  startSong: () => void;
  pauseSong: () => void;
}) {
  const { duck, isPreview } = usePlayerControls();
  const clip = useMemo<VoiceClip | null>(
    () => (voicePath ? { kind: "stored", path: voicePath, durationMs: voiceDurationMs } : null),
    [voicePath, voiceDurationMs]
  );
  const [phase, setPhase] = useState<FilmVoicePhase>("waiting");
  // Turned off with its button for this opening; it waits where it is.
  const [off, setOff] = useState(false);
  const [appActive, setAppActive] = useState(true);
  // Full playback paused for the voice because iOS wouldn't duck it.
  const [songHeld, setSongHeld] = useState(false);
  const [mix] = useState(createMixRestore);
  const player = useVoicePlayer(clip, { overSong: true, onFinish: () => setPhase("done") });
  const { pause: pauseVoice, rewind } = player;

  // Each opening of the film starts the voice afresh.
  const [openFor, setOpenFor] = useState(visible);
  if (openFor !== visible) {
    setOpenFor(visible);
    if (visible) {
      setPhase("waiting");
      setOff(false);
      setAppActive(true);
    }
  }

  const present = !!clip;
  const filmPlaying = visible && !paused && appActive;
  const held = off || clipSoundOn;
  const wanted = present && voiceSounds({ phase, filmPlaying, held });
  const startIn = present ? voiceStartInMs({ phase, filmPlaying, songPlaying, held }) : null;
  const audible = wanted && player.playing;

  /** Silence the voice and give the song back now (idempotent). */
  const quiet = useCallback(() => quietVoice(mix, pauseVoice), [mix, pauseVoice]);

  // The lead-in: the song first, then the voice from its top.
  useEffect(() => {
    if (startIn === null) return;
    const timer = setTimeout(() => {
      rewind();
      setPhase("started");
    }, startIn);
    return () => clearTimeout(timer);
  }, [startIn, rewind]);

  // Play while it should sound; every way out quiets it (voice, then song).
  const begin = useEffectEvent(async () => {
    if ((await player.play()) === "failed") setPhase("done");
  });
  useEffect(() => {
    if (!wanted) return;
    void begin();
    return () => {
      quiet();
    };
  }, [wanted, quiet]);

  // Wanted but not heard for a while (no connection, a link that won't load,
  // a stream that stalled): the film carries on without it.
  const unheard = wanted && !player.playing;
  useEffect(() => {
    if (!unheard) return;
    const timer = setTimeout(() => setPhase("done"), VOICE_STALL_MS);
    return () => clearTimeout(timer);
  }, [unheard]);

  // Turn the song down once the voice is heard (or once a song that started
  // late is playing under it). Undone by quiet().
  useEffect(() => {
    if (!audible || mix.held || songHeld) return;
    if (isPreview) {
      duck(true);
      mix.hold(() => duck(false));
    } else if (songPlaying) {
      if (setDuckOthers(true)) {
        mix.hold(() => setDuckOthers(false));
      } else {
        // The session refused to duck: the song pauses for the voice instead.
        pauseSong();
        setSongHeld(true);
      }
    }
  }, [audible, isPreview, songPlaying, songHeld, mix, duck, pauseSong]);

  // A song paused for the voice comes back when the voice stops sounding,
  // if the film is still playing (not after a close or a pause). In the
  // background it waits: the voice carries on when the app is back.
  const resumeSong = useEffectEvent(() => startSong());
  useEffect(() => {
    if (!songHeld || wanted) return;
    if (visible && !paused && !appActive) return;
    setSongHeld(false);
    if (visible && !paused) resumeSong();
  }, [songHeld, wanted, visible, paused, appActive]);

  // Leaving the app: the voice pauses and the song comes back up right away
  // (not a render later); it carries on when the app is back in front.
  useEffect(() => {
    if (!present || !visible) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        quiet();
        setAppActive(false);
      } else if (state === "active") {
        setAppActive(true);
      }
    });
    return () => sub.remove();
  }, [present, visible, quiet]);

  return {
    /** The film has a voice still to play or playing: show its button. */
    present: present && phase !== "done",
    off,
    /** Turn the voice off (it waits where it is) or back on. */
    setOff,
    /** The song is paused for the voice (iOS wouldn't duck it). */
    songHeld,
    /**
     * Silence it now, before something else ducks the song (a clip's sound),
     * so its undo can't put the song back up under the clip.
     */
    quiet,
  };
}
