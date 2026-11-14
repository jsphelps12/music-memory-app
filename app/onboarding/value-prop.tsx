import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";

/* eslint-disable @typescript-eslint/no-require-imports */
const RUNAWAY_ARTWORK = require("@/assets/images/onboarding/artwork-runaway.jpg");
/* eslint-enable @typescript-eslint/no-require-imports */

// A sample entry drawn the way the Journal draws one: a hairline row, the
// reflection in Newsreader, and moods and people as words in the Meta line.
const MOCK_ENTRY = {
  song: "Runaway",
  artist: "Kanye West",
  reflection: "Road trip through Utah. This song on repeat for 400 miles.",
  meta: "With Emma · Nostalgic",
} as const;

const STEPS = [
  { icon: "musical-note-outline" as const, label: "Capture", detail: "A song in the moment" },
  { icon: "pencil-outline" as const, label: "Reflect", detail: "On what it means" },
  { icon: "time-outline" as const, label: "Revisit", detail: "Your story, anytime" },
];

export default function ValuePropScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "25%" }]} />
      </View>

      <ScreenHeader leading="back" />

      <View style={styles.content}>
        <Text style={styles.heading} accessibilityRole="header">Your life has a soundtrack.</Text>
        <Text style={styles.sub}>Save what a song meant, right when you hear it.</Text>

        <Text style={styles.body}>
          Every song you love is tied to a moment. Soundtracks is where you save that link, while it&apos;s still fresh.
        </Text>

        <View style={styles.steps}>
          {STEPS.map(({ icon, label, detail }) => (
            <View key={label} style={styles.stepRow}>
              <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
              <View style={styles.stepText}>
                <Text style={styles.stepLabel}>{label}</Text>
                <Text style={styles.stepDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.entryWrapper}>
          <MockEntryRow styles={styles} />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Button label="Continue" onPress={() => router.push("/onboarding/timeline-preview" as any)} />
      </View>
    </View>
  );
}

function MockEntryRow({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.entry}>
      <AppImage source={RUNAWAY_ARTWORK} style={styles.entryArtwork} contentFit="cover" />
      <View style={styles.entryText}>
        <Text style={styles.entrySong} numberOfLines={1}>
          {MOCK_ENTRY.song}
          <Text style={styles.entryArtist}>{`  ${MOCK_ENTRY.artist}`}</Text>
        </Text>
        <Text style={styles.entryReflection} numberOfLines={2}>{MOCK_ENTRY.reflection}</Text>
        <Text style={styles.entryMeta} numberOfLines={1}>{MOCK_ENTRY.meta}</Text>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressBarFill: {
      height: 3,
      backgroundColor: theme.colors.accent,
      borderRadius: 2,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    heading: {
      ...theme.typography.headline,
      fontSize: theme.fontSize["2xl"],
      lineHeight: 34,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      ...theme.typography.body,
      lineHeight: 24,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    body: {
      ...theme.typography.body,
      lineHeight: 26,
      color: theme.colors.text,
      marginBottom: theme.spacing["2xl"],
    },
    steps: {
      gap: theme.spacing.xl,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md + 2,
    },
    stepText: {
      flex: 1,
    },
    stepLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    stepDetail: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 19,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    entryWrapper: {
      flex: 1,
      justifyContent: "flex-end",
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.xl,
    },
    entry: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    entryArtwork: { width: 48, height: 48, borderRadius: theme.radii.sm },
    entryText: { flex: 1, gap: 3 },
    entrySong: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    entryArtist: {
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    entryReflection: {
      ...theme.typography.reading,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.text,
    },
    entryMeta: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
    },
  });
}
