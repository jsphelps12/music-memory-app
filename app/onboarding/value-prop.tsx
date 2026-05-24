import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

const STEPS = [
  { icon: "musical-note-outline" as const, label: "Capture", detail: "A song in the moment" },
  { icon: "pencil-outline" as const, label: "Reflect", detail: "On what it means" },
  { icon: "time-outline" as const, label: "Revisit", detail: "Your story, anytime" },
];

export default function ValuePropScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "25%" }]} />
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={12}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.heading}>Your life has a soundtrack.</Text>
        <Text style={styles.sub}>
          Save what a song meant — right when you hear it.
        </Text>

        <Text style={styles.body}>
          Every song you love is tied to a moment. Soundtracks is where you save that link — while it's still fresh.
        </Text>

        <View style={styles.steps}>
          {STEPS.map(({ icon, label, detail }) => (
            <View key={label} style={styles.stepRow}>
              <Ionicons name={icon} size={20} color={theme.colors.accent} />
              <View style={styles.stepText}>
                <Text style={styles.stepLabel}>{label}</Text>
                <Text style={styles.stepDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={() => router.push("/onboarding/timeline-preview" as any)}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
            Continue →
          </Text>
        </TouchableOpacity>
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
    backButton: {
      position: "absolute",
      top: 56,
      left: theme.spacing.xl,
      zIndex: 10,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 88,
    },
    heading: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      lineHeight: 24,
      marginBottom: theme.spacing.xl,
    },
    body: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      lineHeight: 26,
      marginBottom: theme.spacing["2xl"],
    },
    steps: {
      gap: theme.spacing.xl,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    stepText: {
      flex: 1,
    },
    stepLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    stepDetail: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      paddingTop: 12,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
  });
}
