import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { registerForPushNotifications } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/Button";

import { goHome } from "@/lib/goHome";
const NEXT_STEPS = [
  {
    icon: "musical-notes-outline" as const,
    title: "Keep capturing",
    body: "Save moments as they happen, and the songs you keep coming back to.",
  },
  {
    icon: "people-outline" as const,
    title: "Start a shared album",
    body: "Invite friends or family to build a playlist of memories together.",
  },
  {
    icon: "time-outline" as const,
    title: "Your memories resurface",
    body: "On This Day and A Month Ago will bring moments back when you least expect it.",
  },
];

export default function CelebrationScreen() {
  const router = useRouter();
  const { user, profile, completeOnboarding } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  async function handleContinue() {
    if (!user || continuing) return;
    setContinuing(true);
    try {
      // Mark onboarding complete. Profile fields were already persisted by
      // saveOnboardingData during the questionnaire — we just need the flag.
      await completeOnboarding({
        displayName: profile?.displayName ?? "",
        username: profile?.username ?? undefined,
        birthYear: profile?.birthYear ?? null,
        country: profile?.country ?? null,
        favoriteArtists: [],
        favoriteSongs: [],
        genrePreferences: [],
      });
      posthog.capture("onboarding_completed");
    } catch {
      // Non-fatal — worst case the user re-enters onboarding on next open,
      // but crash recovery will catch them and send them straight to tabs.
    }
    try {
      await registerForPushNotifications(user.id);
      posthog.capture("notifications_enabled");
    } catch {}
    goHome(router);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + theme.spacing["3xl"] }]}>
        <Icon name="musical-notes-outline" size={36} color={theme.colors.textSecondary} style={styles.icon} />

        <Text style={styles.heading} accessibilityRole="header">Your story has begun.</Text>
        <Text style={styles.sub}>
          Every song you save becomes a piece of your story. Here&apos;s what to explore next.
        </Text>

        <View style={styles.steps}>
          {NEXT_STEPS.map((step) => (
            <View key={step.title} style={styles.step}>
              <Icon name={step.icon} size={20} color={theme.colors.textSecondary} style={styles.stepIcon} />
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Button
          label="Turn on notifications"
          icon="notifications-outline"
          onPress={handleContinue}
          loading={continuing}
        />
        <Text style={styles.notifHint}>
          We&apos;ll resurface old memories, nudge you to capture new ones, and celebrate milestones along the way.
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
    },
    icon: {
      marginBottom: theme.spacing.xl,
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
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
    },
    steps: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    step: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    stepIcon: {
      width: 24,
      marginTop: 1,
    },
    stepText: {
      flex: 1,
    },
    stepTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      marginBottom: 2,
    },
    stepBody: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    notifHint: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      lineHeight: 18,
      textAlign: "center",
      color: theme.colors.textSecondary,
    },
  });
}
