import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { registerForPushNotifications } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";

const NEXT_STEPS = [
  {
    icon: "musical-notes" as const,
    accent: "primary" as const,
    title: "Keep capturing",
    body: "The more moments you log, the richer your timeline gets.",
  },
  {
    icon: "people-outline" as const,
    accent: "secondary" as const,
    title: "Start a shared collection",
    body: "Invite friends or family to add memories to the same playlist.",
  },
  {
    icon: "gift-outline" as const,
    accent: "primary" as const,
    title: "Gift a memory",
    body: "Share any moment as a link — no app required to view it.",
  },
];

export default function CelebrationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  async function handleContinue() {
    if (!user || continuing) return;
    setContinuing(true);
    try {
      await registerForPushNotifications(user.id);
      posthog.capture("notifications_enabled");
    } catch {}
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="musical-notes" size={40} color={theme.colors.accent} />
        </View>

        <Text style={styles.heading}>Your first memory is saved.</Text>
        <Text style={styles.sub}>
          Every song you log becomes a piece of your story. Here's what to explore next.
        </Text>

        <View style={styles.steps}>
          {NEXT_STEPS.map((step) => (
            <View key={step.title} style={styles.step}>
              <View style={[styles.stepIcon, {
                backgroundColor: step.accent === "secondary" ? theme.colors.accentSecondaryBg : theme.colors.accentBg,
              }]}>
                <Ionicons
                  name={step.icon}
                  size={20}
                  color={step.accent === "secondary" ? theme.colors.accentSecondary : theme.colors.accent}
                />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={handleContinue}
          activeOpacity={0.8}
          disabled={continuing}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.buttonText} style={{ marginRight: 8 }} />
          <Text style={[styles.continueButtonText, { color: theme.colors.buttonText }]}>
            Turn on notifications
          </Text>
        </TouchableOpacity>
        <Text style={[styles.notifHint, { color: theme.colors.textTertiary }]}>
          We'll remind you when a song anniversary comes up. You can manage this in Settings anytime.
        </Text>
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
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 80,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing["2xl"],
    },
    heading: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      lineHeight: 22,
      marginBottom: theme.spacing["3xl"],
    },
    steps: {
      gap: theme.spacing.xl,
    },
    step: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    stepText: {
      flex: 1,
    },
    stepTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginBottom: 2,
    },
    stepBody: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      gap: 12,
    },
    notifHint: {
      fontSize: theme.fontSize.xs,
      textAlign: "center",
      lineHeight: 18,
    },
    continueButton: {
      height: 52,
      borderRadius: theme.radii.button,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    continueButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
  });
}
