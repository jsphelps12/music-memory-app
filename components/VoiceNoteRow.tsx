import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { IconButton } from "@/components/IconButton";
import { useVoicePlayer } from "@/hooks/useVoicePlayer";
import { voiceTimeLabel, type VoiceClip } from "@/lib/voice";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  /** The recording's path in the private moment-voice bucket. */
  path: string;
  durationMs: number | null;
}

/**
 * The owner's voice recording on their moment (lib/voice.ts): play or pause,
 * "Your voice · 0:42", and a slim line for how far it has played. Plays
 * through a signed URL in its own player (hooks/useVoicePlayer.ts), so it
 * pauses the song and the song stops it. Only ever shown to the owner.
 */
export function VoiceNoteRow({ path, durationMs }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const clip = useMemo<VoiceClip>(() => ({ kind: "stored", path, durationMs: durationMs ?? 0 }), [path, durationMs]);
  const playback = useVoicePlayer(clip);

  const length = playback.durationMs || durationMs || 0;
  const started = playback.playing || playback.positionMs > 0;
  const shown = started ? playback.positionMs : length;
  const progress = length > 0 ? Math.min(1, playback.positionMs / length) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {playback.loading ? (
          <View style={styles.spinner}>
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          </View>
        ) : (
          <IconButton
            name={playback.playing ? "pause" : "play"}
            variant="filled"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              playback.toggle();
            }}
            accessibilityLabel={playback.playing ? "Pause your voice recording" : "Play your voice recording"}
            testID="moment-voice-play"
          />
        )}
        <View style={styles.info}>
          <Text style={styles.label} accessibilityLabel={`Your voice, ${voiceTimeLabel(length)}`}>
            Your voice · {voiceTimeLabel(shown)}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
      {playback.error ? <Text style={styles.error}>{playback.error}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      marginTop: 22,
      gap: theme.spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    // Holds the button's place while the recording's link is fetched.
    spinner: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    info: {
      flex: 1,
      gap: theme.spacing.sm,
    },
    label: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    track: {
      height: 2,
      borderRadius: 1,
      backgroundColor: theme.colors.fill,
      overflow: "hidden",
    },
    fill: {
      height: 2,
      backgroundColor: theme.colors.text,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
    },
  });
}
