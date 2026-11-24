import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { usePlayerControls, usePlayerProgress } from "@/contexts/PlayerContext";
import { formatSongTime, normalizePartMs } from "@/lib/songPart";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import type { Song } from "@/types";

/** A song of unknown length still gets a usable scrubber. */
const FALLBACK_DURATION_MS = 6 * 60 * 1000;
/** VoiceOver's swipe up/down on the scrubber moves this far. */
const ACCESSIBILITY_STEP_MS = 5000;

interface Props {
  visible: boolean;
  onClose: () => void;
  song: Song;
  /** The song's length; null when not known yet. */
  durationMs: number | null;
  /** Its preview, for someone who can't play the full song. */
  previewUrl?: string | null;
  value: number | null;
  onChange: (partMs: number | null) => void;
}

/**
 * "Part of the song" (lib/songPart.ts): one point where the moment lives in
 * the song, picked on a scrubber. "Play from here" plays the full song from
 * the point so it can be found by ear, and while it plays, "Use where it's
 * playing" takes the second you're hearing. Capture and Edit both use it.
 */
export function SongPartSheet({ visible, onClose, song, durationMs, previewUrl, value, onChange }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { currentSong, isPlaying, isPreview, playFull, pause } = usePlayerControls();
  const { playbackTime } = usePlayerProgress();
  const [trackWidth, setTrackWidth] = useState(1);

  const length = durationMs && durationMs > 0 ? durationMs : FALLBACK_DURATION_MS;
  const songId = song.spotifyId ?? song.appleMusicId;
  const thisPlaying = !!songId && (currentSong?.spotifyId ?? currentSong?.appleMusicId) === songId && isPlaying;
  // A preview's clock is its own 30 s, not the song's.
  const hearingFull = thisPlaying && !isPreview;
  const shown = value ?? 0;
  const fraction = Math.min(1, shown / length);

  const setFromX = (x: number) => {
    const ms = (Math.max(0, Math.min(trackWidth, x)) / trackWidth) * length;
    onChange(normalizePartMs(ms, durationMs));
  };

  const scrub = Gesture.Race(
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-4, 4])
      .onStart((e) => setFromX(e.x))
      .onUpdate((e) => setFromX(e.x))
      .onEnd(() => Haptics.selectionAsync()),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (success) {
          setFromX(e.x);
          Haptics.selectionAsync();
        }
      })
  );

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const step = e.nativeEvent.actionName === "increment" ? ACCESSIBILITY_STEP_MS : -ACCESSIBILITY_STEP_MS;
    onChange(normalizePartMs(shown + step, durationMs));
  };

  const playFromHere = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (thisPlaying) {
      pause();
      return;
    }
    void playFull(song, previewUrl || undefined, value != null ? value / 1000 : undefined);
  };

  const useWhereItsPlaying = () => {
    Haptics.selectionAsync();
    onChange(normalizePartMs(playbackTime * 1000, durationMs));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Part of the song" testID="song-part-sheet">
      <View style={styles.body}>
        <Text style={styles.hint}>Where this moment lives in the song. Playing it starts here.</Text>

        <View style={styles.timeRow}>
          <Text style={styles.time} testID="song-part-time">
            {value != null ? formatSongTime(value) : "Not set"}
          </Text>
          {durationMs ? <Text style={styles.length}>of {formatSongTime(durationMs)}</Text> : null}
        </View>

        <GestureDetector gesture={scrub}>
          <View
            style={styles.scrubArea}
            onLayout={(e) => setTrackWidth(Math.max(1, e.nativeEvent.layout.width))}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Part of the song"
            accessibilityValue={{ text: value != null ? formatSongTime(value) : "Not set" }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={onAccessibilityAction}
            testID="song-part-scrubber"
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
            </View>
            <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
          </View>
        </GestureDetector>

        <View style={styles.actions}>
          <Button
            label={thisPlaying ? "Pause" : value != null ? "Play from here" : "Play"}
            icon={thisPlaying ? "pause" : "play"}
            variant="secondary"
            size="pill"
            onPress={playFromHere}
            testID="song-part-play"
          />
          {hearingFull ? (
            <Button
              label={`Use ${formatSongTime(playbackTime * 1000)}`}
              variant="secondary"
              size="pill"
              onPress={useWhereItsPlaying}
              testID="song-part-use-now"
            />
          ) : null}
        </View>

        {value != null ? (
          <Button
            label="Clear"
            variant="text"
            size="pill"
            onPress={() => {
              Haptics.selectionAsync();
              onChange(null);
            }}
            testID="song-part-clear"
          />
        ) : null}
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
    // A tall band so the thin track is easy to grab.
    scrubArea: {
      height: 36,
      justifyContent: "center",
    },
    track: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.fill,
      overflow: "hidden",
    },
    fill: {
      height: 3,
      backgroundColor: theme.colors.text,
    },
    thumb: {
      position: "absolute",
      width: 18,
      height: 18,
      marginLeft: -9,
      borderRadius: 9,
      backgroundColor: theme.colors.text,
    },
    actions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
  });
}
