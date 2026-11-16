import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";

// Every real way into capture (checked against app/create.tsx and
// targets/widget, 2026-11). No count in the copy: it drifts.
const CAPTURE_METHODS = [
  {
    icon: "add",
    label: "The + button",
    desc: "Search for any song by title or artist. If Apple Music is already playing, the song is filled in for you.",
  },
  {
    icon: "ear-outline",
    label: "Identify",
    desc: "Hear something you love out in the world? Tap Identify on the capture screen and Soundtracks will name it.",
  },
  {
    icon: "share-outline",
    label: "Share from Apple Music or Spotify",
    desc: "Tap Share on any song, then Soundtracks.",
  },
  {
    icon: "image-outline",
    label: "Share from Photos",
    desc: "Share a photo to Soundtracks and start an entry around it.",
  },
  {
    icon: "apps-outline",
    label: "Home Screen and Lock Screen widgets",
    desc: "One tap from anywhere on your phone to capture, or to identify what's playing.",
  },
  {
    icon: "toggle-outline",
    label: "Control Center and the Action button",
    desc: "On iOS 18 and later, add a Soundtracks control to capture or identify without opening the app first.",
  },
] as const;

export default function HelpScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScreenHeader leading="back" title="How to capture" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["3xl"] }]}
      >
        <Text style={styles.intro}>
          However a song finds you, there's a way to save it before it slips away.
        </Text>

        <View style={styles.list}>
          {CAPTURE_METHODS.map(({ icon, label, desc }) => (
            <View key={label} style={styles.row}>
              <Icon name={icon} size={20} color={theme.colors.textSecondary} style={styles.icon} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowDesc}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
    },
    intro: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: theme.spacing.lg,
      gap: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    icon: {
      width: 24,
      marginTop: 1,
    },
    rowText: {
      flex: 1,
    },
    rowLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    rowDesc: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}
