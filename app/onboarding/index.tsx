import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, TouchableWithoutFeedback, StyleSheet, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";

import { goHome } from "@/lib/goHome";
export default function QuestionnaireScreen() {
  const router = useRouter();
  const { completeOnboarding, saveOnboardingData, user, profile, profileReady } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const crashRecoveryCancelled = useRef(false);

  useEffect(() => {
    if (!user?.id || !profileReady) return;
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        if (count && count > 0 && !crashRecoveryCancelled.current) {
          const data: OnboardingData = {
            displayName: profile?.displayName?.trim() ?? "",
            favoriteArtists: [],
            favoriteSongs: [],
            genrePreferences: [],
          };
          completeOnboarding(data)
            .then(async () => {
              try { if (user) await registerForPushNotifications(user.id); } catch {}
              goHome(router);
            })
            .catch(() => {});
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileReady]);

  async function handleSubmit() {
    Keyboard.dismiss();
    if (!displayName.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please enter your name.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveOnboardingData({ displayName: displayName.trim() });
      if (user) {
        posthog.identify(user.id, { $set: { display_name: displayName.trim() } });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      crashRecoveryCancelled.current = true;
      router.push({ pathname: "/onboarding/value-prop" } as any);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.flex}>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: "16%" }]} />
          </View>

          {/* No back on the first step; the same top as the steps that have one. */}
          <View style={[styles.topRow, { paddingTop: insets.top + 44 + theme.spacing.md }]}>
            <Text style={styles.heading} accessibilityRole="header">Welcome to Soundtracks.</Text>
            <Text style={styles.sub}>What should we call you?</Text>
          </View>

          <View style={styles.body}>
            <TextField
              placeholder="Your name"
              value={displayName}
              onChangeText={(t) => { setDisplayName(t); setError(""); }}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              textContentType="name"
              autoComplete="name"
              maxLength={40}
              onSubmitEditing={handleSubmit}
            />
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <Button label="Continue" onPress={handleSubmit} loading={saving} />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: { flex: 1 },
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressBarFill: {
      height: 3,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the onboarding progress indicator
      borderRadius: 2,
    },
    topRow: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    body: {
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
      color: theme.colors.textSecondary,
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.destructive,
      marginTop: theme.spacing.sm,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
    },
  });
}
