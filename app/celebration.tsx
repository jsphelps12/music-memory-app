import { useEffect, useMemo, useState } from "react";
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
    title: "Keep capturing",
    body: "The more moments you log, the richer your timeline gets.",
  },
  {
    icon: "people-outline" as const,
    title: "Start a shared collection",
    body: "Invite friends or family to add memories to the same playlist.",
  },
  {
    icon: "gift-outline" as const,
    title: "Gift a memory",
    body: "Share any moment as a link — no app required to view it.",
  },
];

export default function CelebrationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [notifState, setNotifState] = useState<"idle" | "asking" | "done">("idle");

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  async function handleEnableNotifications() {
    if (!user) return;
    setNotifState("asking");
    try {
      await registerForPushNotifications(user.id);
    } catch {}
    setNotifState("done");
  }

  function handleContinue() {
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
              <View style={[styles.stepIcon, { backgroundColor: theme.colors.chipBg }]}>
                <Ionicons name={step.icon} size={20} color={theme.colors.accent} />
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
        {notifState !== "done" ? (
          <TouchableOpacity
            style={[styles.notifButton, { borderColor: theme.colors.accent }]}
            onPress={handleEnableNotifications}
            activeOpacity={0.8}
            disabled={notifState === "asking"}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.notifButtonText, { color: theme.colors.accent }]}>
              Turn on memory reminders
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.notifDone}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.success ?? theme.colors.accent} />
            <Text style={[styles.notifDoneText, { color: theme.colors.textSecondary }]}>
              You'll be notified about On This Day memories
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.buttonText }]}>
            Go to my timeline
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
    notifButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    notifButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    notifDone: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 52,
    },
    notifDoneText: {
      fontSize: theme.fontSize.sm,
    },
    continueButton: {
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    continueButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
  });
}
