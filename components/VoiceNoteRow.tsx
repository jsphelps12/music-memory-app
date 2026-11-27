import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { IconButton } from "@/components/IconButton";
import { VoiceProgress } from "@/components/VoiceProgress";
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
        {/* While the recording's link is fetched a spinner holds the
            button's place: the button stays laid out underneath (hidden),
            so the spinner's box is always the button's own size. */}
        <View pointerEvents={playback.loading ? "none" : "auto"}>
          <View
            style={playback.loading ? styles.hidden : null}
            accessibilityElementsHidden={playback.loading}
            importantForAccessibility={playback.loading ? "no-hide-descendants" : "auto"}
          >
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
          </View>
          {playback.loading ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={styles.label} accessibilityLabel={`Your voice, ${voiceTimeLabel(length)}`}>
            Your voice · {voiceTimeLabel(shown)}
          </Text>
          <VoiceProgress progress={progress} />
        </View>
      </View>
      {playback.error ? <Text style={styles.error}>{playback.error}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      marginTop: theme.spacing.xl,
      gap: theme.spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    hidden: {
      opacity: 0,
    },
    spinner: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
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
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
    },
  });
}
