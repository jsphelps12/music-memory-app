import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

export default function QuestionnaireScreen() {
  const router = useRouter();
  const { completeOnboarding, saveOnboardingData, user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const crashRecoveryCancelled = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        if (count && count > 0 && !crashRecoveryCancelled.current) {
          const data: OnboardingData = {
            displayName: displayName.trim(),
            favoriteArtists: [],
            favoriteSongs: [],
            genrePreferences: [],
          };
          completeOnboarding(data)
            .then(async () => {
              try { if (user) await registerForPushNotifications(user.id); } catch {}
              router.replace("/(tabs)" as any);
            })
            .catch(() => {});
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
        <View style={{ flex: 1 }}>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: "16%" }]} />
          </View>

          <View style={styles.topRow}>
            <Text style={styles.heading}>Welcome to soundtracks.</Text>
            <Text style={styles.sub}>What should we call you?</Text>
          </View>

          <View style={styles.body}>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}
              placeholder="Your name"
              placeholderTextColor={theme.colors.placeholder}
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
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.buttonText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Continue →</Text>
              )}
            </TouchableOpacity>
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
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressBarFill: {
      height: 3,
      backgroundColor: theme.colors.accent,
      borderRadius: 2,
    },
    topRow: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 72,
      paddingBottom: theme.spacing.xl,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
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
    },
    input: {
      height: 52,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
    },
    error: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
      marginHorizontal: theme.spacing.xl,
      marginBottom: 8,
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
      fontWeight: theme.fontWeight.semibold,
    },
  });
}
