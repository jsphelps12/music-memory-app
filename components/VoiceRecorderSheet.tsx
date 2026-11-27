import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioRecorder,
  type AudioMode,
  type RecordingOptions,
} from "expo-audio";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { VoiceProgress } from "@/components/VoiceProgress";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { useVoicePlayer } from "@/hooks/useVoicePlayer";
import { friendlyError } from "@/lib/errors";
import { MAX_VOICE_MS, isKeepableTake, takeLengthMs, voiceTimeLabel, type VoiceClip } from "@/lib/voice";
import { deleteLocalVoice, keepVoiceRecording } from "@/lib/voiceFiles";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/**
 * Mono AAC in an m4a at 64 kbps: about half a megabyte a minute, clear for a
 * voice, and what the moment-voice bucket accepts (audio/mp4).
 */
const VOICE_RECORDING: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: "audio/mp4", bitsPerSecond: 64000 },
};

/**
 * Recording pauses other apps' music (Josh, 2026-11-26): "doNotMix" takes
 * the audio session for itself, so Music or Spotify playing when you tap
 * Record stops instead of being recorded under your voice.
 */
const RECORDING_MODE: Partial<AudioMode> = { allowsRecording: true, playsInSilentMode: true, interruptionMode: "doNotMix" };

/**
 * The app's own playback mode, the one PlayerContext sets at launch
 * (`{ playsInSilentMode: true }`: playback, mixing with others, not
 * recording). Keep the two the same.
 */
const APP_PLAYBACK_MODE: Partial<AudioMode> = { playsInSilentMode: true };

/**
 * Back to the app's playback mode after recording. The session is let go
 * first while it's still "doNotMix", which tells iOS to let the music that
 * recording paused carry on (notify others on deactivation); then the
 * playback mode goes back (while recording is allowed iOS plays through the
 * earpiece) and audio is switched on again, so the next play isn't ignored.
 * Each step is best effort and the last always runs.
 */
async function restorePlaybackMode() {
  try {
    await setIsAudioActiveAsync(false);
  } catch {}
  try {
    await setAudioModeAsync(APP_PLAYBACK_MODE);
  } catch {}
  try {
    await setIsAudioActiveAsync(true);
  } catch {}
}

type Phase = "idle" | "starting" | "recording" | "stopping" | "denied";

/** A take is being made or kept: the recorder must stay mounted until it's done. */
function takeInProgress(phase: Phase): boolean {
  return phase === "starting" || phase === "recording" || phase === "stopping";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  /** The recording now: a take on this phone, or the moment's stored one (Edit). */
  value: VoiceClip | null;
  /** A new take (always on this phone), or null when it's deleted. */
  onChange: (clip: VoiceClip | null) => void;
  /**
   * Which capture this is, when one screen can become another (a share
   * arriving into an open capture, app/create.tsx). A take still being made
   * when it changes is thrown away: it never lands in the new capture, and
   * the take it was replacing stays with the old one's draft.
   */
  session?: string;
}

/**
 * "Your voice" (lib/voice.ts): record up to 3 minutes of saying what the
 * song is doing for you, play it back, record again or delete it. Done keeps
 * it. Capture and Edit both use it; in Edit a stored recording plays through
 * a signed URL and is only replaced or removed when the edit is saved.
 *
 * A take replaced or deleted here that was only on this phone is deleted
 * here too; a stored one is left to the save (lib/saveMoment.ts).
 *
 * The recorder and its player exist only while the sheet is open (through
 * its closing animation) or a take is still being made or kept, so a capture
 * or edit screen that never opens it holds no recorder and polls nothing.
 */
export function VoiceRecorderSheet(props: Props) {
  // Open from showing until the sheet has finished closing.
  const [open, setOpen] = useState(props.visible);
  const [busy, setBusy] = useState(false);
  if (props.visible && !open) setOpen(true);
  const onClosed = useCallback(() => setOpen(false), []);
  if (!open && !busy) return null;
  return <VoiceRecorder {...props} onBusyChange={setBusy} onClosed={onClosed} />;
}

function VoiceRecorder({
  visible,
  onClose,
  userId,
  value,
  onChange,
  session,
  onBusyChange,
  onClosed,
}: Props & { onBusyChange: (busy: boolean) => void; onClosed: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isPlaying: songPlaying, pause: pauseSong } = usePlayerControls();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  // The recorder's state, polled only while recording.
  const [recorderState, setRecorderState] = useState({ isRecording: false, durationMillis: 0 });
  const playback = useVoicePlayer(value);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // For the effects and async steps below, which outlive the render that
  // started them. Synced in effects, never read in render.
  const phaseRef = useRef<Phase>("idle");
  const valueRef = useRef(value);
  const visibleRef = useRef(visible);
  const sessionRef = useRef(session);
  // The session the take being made belongs to.
  const takeSession = useRef(session);
  // The recorder reported recording since this take started, so a stop it
  // reports after that is an interruption (a call, Siri), not the start-up.
  const sawRecording = useRef(false);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // The host keeps this mounted while a take is in progress.
  useEffect(() => {
    onBusyChange(takeInProgress(phase));
  }, [phase, onBusyChange]);

  const setPhaseNow = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const finish = async (reason: "stop" | "limit" | "interrupted") => {
    if (phaseRef.current !== "recording") return;
    setPhaseNow("stopping");
    // Read before stopping: a stopped recorder reports no length.
    const lengthMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
    } catch {}
    await restorePlaybackMode();
    const recorded = recorder.uri;
    const abandoned = () => takeSession.current !== sessionRef.current;
    if (abandoned()) {
      deleteLocalVoice(recorded);
    } else if (!isKeepableTake(lengthMs)) {
      deleteLocalVoice(recorded);
      setNote("That was too short to keep.");
    } else if (!recorded) {
      setError("The recording couldn't be saved. Try again.");
    } else {
      let uri: string | null = null;
      try {
        uri = await keepVoiceRecording(userId, recorded);
      } catch (e) {
        setError(friendlyError(e));
      }
      if (uri && abandoned()) {
        deleteLocalVoice(uri);
      } else if (uri) {
        const previous = valueRef.current;
        onChange({ kind: "local", uri, durationMs: takeLengthMs(lengthMs) });
        // A take only on this phone, now recorded over.
        if (previous?.kind === "local") deleteLocalVoice(previous.uri);
        if (reason === "limit") setNote("Stopped at 3:00, the longest a recording can be.");
        else if (reason === "interrupted") setNote("Recording stopped. What you said is kept.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    setPhaseNow("idle");
  };

  const start = async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "denied") return;
    setError("");
    setNote("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let granted: boolean;
    try {
      granted = (await AudioModule.requestRecordingPermissionsAsync()).granted;
    } catch (e) {
      setError(friendlyError(e));
      return;
    }
    if (!granted) {
      setPhaseNow("denied");
      return;
    }
    playback.pause();
    if (songPlaying) pauseSong();
    setPhaseNow("starting");
    takeSession.current = sessionRef.current;
    sawRecording.current = false;
    setRecorderState({ isRecording: false, durationMillis: 0 });
    let started = false;
    try {
      await setAudioModeAsync(RECORDING_MODE);
      await recorder.prepareToRecordAsync();
      recorder.record();
      started = true;
    } catch (e) {
      await restorePlaybackMode();
      setError(friendlyError(e));
    }
    setPhaseNow(started ? "recording" : "idle");
    if (!started) return;
    // Closed, or the app left, while it was starting: keep what's there
    // rather than record with nothing on screen.
    if (AppState.currentState === "background") void finish("interrupted");
    else if (!visibleRef.current || takeSession.current !== sessionRef.current) void finish("stop");
  };

  // Poll the recorder while recording, and only then.
  useEffect(() => {
    if (phase !== "recording") return;
    const read = () => {
      let s: { isRecording: boolean; durationMillis: number };
      try {
        s = recorder.getStatus();
      } catch {
        return;
      }
      setRecorderState((prev) =>
        prev.isRecording === s.isRecording && Math.abs(prev.durationMillis - s.durationMillis) < 50
          ? prev
          : { isRecording: s.isRecording, durationMillis: s.durationMillis }
      );
    };
    read();
    const timer = setInterval(read, 200);
    return () => clearInterval(timer);
  }, [phase, recorder]);

  // The 3-minute cap, and a recording the system stopped (a call, Siri).
  const onRecorderTick = useEffectEvent((current: Phase, isRecording: boolean, durationMillis: number) => {
    if (current !== "recording") return;
    if (isRecording) sawRecording.current = true;
    if (durationMillis >= MAX_VOICE_MS) void finish("limit");
    else if (!isRecording && sawRecording.current) void finish("interrupted");
  });
  useEffect(() => {
    onRecorderTick(phase, recorderState.isRecording, recorderState.durationMillis);
  }, [phase, recorderState.isRecording, recorderState.durationMillis]);

  // Whether the microphone was allowed since it was refused (in Settings).
  const recheckPermission = async () => {
    let granted = false;
    try {
      granted = (await AudioModule.getRecordingPermissionsAsync()).granted;
    } catch {}
    if (granted && phaseRef.current === "denied") setPhaseNow("idle");
  };

  // Opening starts clean (what the last opening said is gone); closing
  // (Done, a swipe) while recording keeps the take, and stops anything
  // playing. Done keeps whatever is there.
  const onVisibility = useEffectEvent((isVisible: boolean) => {
    visibleRef.current = isVisible;
    if (isVisible) {
      setNote("");
      setError("");
      if (phaseRef.current === "denied") void recheckPermission();
      return;
    }
    playback.pause();
    if (phaseRef.current === "recording") void finish("stop");
  });
  useEffect(() => {
    onVisibility(visible);
  }, [visible]);

  // A new capture in the same screen: a take being made for the old one is
  // stopped and thrown away (finish sees the session changed).
  const onSession = useEffectEvent((next: string | undefined) => {
    sessionRef.current = next;
    if (phaseRef.current === "recording" && takeSession.current !== next) void finish("stop");
  });
  useEffect(() => {
    onSession(session);
  }, [session]);

  // The app going to the background ends a recording, keeping the take.
  // expo-audio pauses the recorder in the background and resumes it in the
  // foreground by itself, which would turn the mic back on with nobody
  // asking (even behind the app lock), so the take ends here instead. Back
  // in front after being refused, the microphone may have been allowed in
  // Settings meanwhile.
  const onAppState = useEffectEvent((state: string) => {
    if (state === "background" && phaseRef.current === "recording") void finish("interrupted");
    else if (state === "active" && phaseRef.current === "denied") void recheckPermission();
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => onAppState(state));
    return () => sub.remove();
  }, []);

  // The screen going away mid-recording: the recorder is released with it,
  // and the audio session must not stay in recording mode.
  useEffect(
    () => () => {
      if (takeInProgress(phaseRef.current)) void restorePlaybackMode();
    },
    []
  );

  const remove = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    playback.pause();
    const previous = value;
    onChange(null);
    if (previous?.kind === "local") deleteLocalVoice(previous.uri);
    setNote("");
  };

  const recording = phase === "recording" || phase === "stopping";
  const shownMs = recording
    ? Math.min(recorderState.durationMillis, MAX_VOICE_MS)
    : value
      ? playback.playing || playback.positionMs > 0
        ? playback.positionMs
        : value.durationMs
      : 0;
  const progress =
    value && !recording && playback.durationMs > 0 ? Math.min(1, playback.positionMs / playback.durationMs) : 0;

  const hint =
    phase === "denied"
      ? "Recording needs the microphone. You can turn it on for Soundtracks in Settings."
      : recording
        ? "Recording. It stops by itself at 3:00."
        : value
          ? "Done keeps it with the moment. Only you can hear it."
          : "Say what this song is doing for you, up to 3 minutes. Only you can hear it.";

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} title="Your voice" testID="voice-sheet">
      <View style={styles.body}>
        <Text style={styles.hint}>{hint}</Text>

        {phase !== "denied" ? (
          <View style={styles.timeRow}>
            <Text
              style={styles.time}
              testID="voice-time"
              accessibilityLabel={recording ? `Recording, ${voiceTimeLabel(shownMs)}` : voiceTimeLabel(shownMs)}
            >
              {voiceTimeLabel(shownMs)}
            </Text>
            {recording ? <Text style={styles.length}>of {voiceTimeLabel(MAX_VOICE_MS)}</Text> : null}
            {value && !recording && (playback.playing || playback.positionMs > 0) ? (
              <Text style={styles.length}>of {voiceTimeLabel(value.durationMs)}</Text>
            ) : null}
          </View>
        ) : null}

        {value && !recording && phase !== "denied" ? (
          <VoiceProgress progress={progress} />
        ) : null}

        {phase === "denied" ? (
          <Button
            label="Open Settings"
            icon="settings-outline"
            variant="secondary"
            size="pill"
            onPress={() => void Linking.openSettings()}
            accessibilityLabel="Open Settings to allow the microphone"
            testID="voice-open-settings"
          />
        ) : recording ? (
          <Button
            label="Stop"
            icon="stop"
            onPress={() => void finish("stop")}
            loading={phase === "stopping"}
            accessibilityLabel="Stop recording"
            testID="voice-stop"
          />
        ) : value ? (
          <>
            <View style={styles.actions}>
              <Button
                label={playback.playing ? "Pause" : "Play"}
                icon={playback.playing ? "pause" : "play"}
                variant="secondary"
                size="pill"
                loading={playback.loading}
                onPress={() => {
                  Haptics.selectionAsync();
                  playback.toggle();
                }}
                accessibilityLabel={playback.playing ? "Pause your recording" : "Play your recording"}
                testID="voice-play"
              />
              <Button
                label="Record again"
                icon="mic-outline"
                variant="secondary"
                size="pill"
                loading={phase === "starting"}
                onPress={() => void start()}
                accessibilityLabel="Record again, replacing this recording"
                testID="voice-record-again"
              />
            </View>
            <Button
              label="Delete"
              variant="text"
              tone="destructive"
              size="pill"
              onPress={remove}
              accessibilityLabel="Delete this recording"
              testID="voice-delete"
            />
          </>
        ) : (
          <Button
            label="Record"
            icon="mic"
            onPress={() => void start()}
            loading={phase === "starting"}
            accessibilityLabel="Start recording your voice"
            testID="voice-record"
          />
        )}

        {note ? <Text style={styles.note}>{note}</Text> : null}
        {error || playback.error ? <Text style={styles.error}>{error || playback.error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
      gap: theme.spacing.lg,
    },
    hint: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: theme.spacing.sm,
    },
    time: {
      ...theme.typography.headline,
      color: theme.colors.text,
      fontVariant: ["tabular-nums"],
    },
    length: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    actions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    note: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
    },
  });
}
