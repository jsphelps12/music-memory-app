import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";

const CAPTURE_METHODS = [
  { icon: "search-outline", label: "Search", desc: "Find any song by title or artist" },
  { icon: "musical-note-outline", label: "Now Playing", desc: "Auto-fills when Apple Music is playing" },
  { icon: "share-outline", label: "Share from Apple Music / Spotify", desc: "Tap Share → Soundtracks in any music app" },
  { icon: "image-outline", label: "Share from Photos", desc: "Tap Share → Soundtracks from camera roll" },
  { icon: "ear-outline", label: "ShazamKit", desc: "Hear a song anywhere — identify it in-app" },
] as const;

export default function HelpScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>How to Capture</Text>
        <CloseButton onPress={() => router.back()} />
      </View>

      <Text style={styles.subtitle}>
        There are five ways to add a song to a moment.
      </Text>

      <View style={styles.card}>
        {CAPTURE_METHODS.map(({ icon, label, desc }, idx) => (
          <View key={label} style={[styles.row, idx > 0 && styles.rowBorder]}>
            <View style={styles.iconWrap}>
              <Ionicons name={icon} size={20} color={theme.colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      paddingTop: 64,
      paddingBottom: 48,
      paddingHorizontal: theme.spacing.xl,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.lg,
    },
    title: {
      fontSize: 26,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
      lineHeight: 22,
    },
    card: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    iconWrap: {
      width: 32,
      alignItems: "center",
    },
    rowText: {
      flex: 1,
    },
    rowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    rowDesc: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
  });
}
