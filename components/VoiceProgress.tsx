import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/**
 * How far a voice recording has played (lib/voice.ts): a slim ink line on
 * the quiet fill. The one track for a recording, on the moment
 * (VoiceNoteRow) and in the recorder sheet (VoiceRecorderSheet).
 */
export function VoiceProgress({ progress }: { /** 0 to 1. */ progress: number }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const shown = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${shown * 100}%` }]} />
    </View>
  );
}

// The track's thickness, the same as the song's progress lines (MiniPlayer,
// SongPartSheet).
const TRACK_HEIGHT = 3;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    track: {
      height: TRACK_HEIGHT,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.fill,
      overflow: "hidden",
    },
    fill: {
      height: TRACK_HEIGHT,
      backgroundColor: theme.colors.text,
    },
  });
}
