import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Moment } from "@/types";
import { Button } from "@/components/Button";

export default function OnboardingCelebrationScreen() {
  const router = useRouter();
  const { completeOnboarding, profile, user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { moment1Id, moment2Id } = useLocalSearchParams<{ moment1Id: string; moment2Id: string }>();

  const [moment1Data, setMoment1Data] = useState<Moment | null>(null);
  const [moment2Data, setMoment2Data] = useState<Moment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!moment1Id) return;
    supabase.from("moments").select("*").eq("id", moment1Id).single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) return;
        setMoment1Data(mapRowToMoment(data));
      });
  }, [moment1Id]);

  useEffect(() => {
    if (!moment2Id) return;
    supabase.from("moments").select("*").eq("id", moment2Id).single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) return;
        setMoment2Data(mapRowToMoment(data));
      });
  }, [moment2Id]);

  const momentCount = [moment1Id, moment2Id].filter(Boolean).length;
  const celebrationMoments = [moment2Data, moment1Data].filter(Boolean) as Moment[];

  const subtitle =
    momentCount === 0
      ? "Your journal is ready. Start adding memories anytime."
      : momentCount === 1
      ? "One memory saved. Your soundtrack has begun."
      : "Two memories saved. Welcome.";

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await completeOnboarding({
        displayName: profile?.displayName ?? "",
        username: profile?.username ?? undefined,
        birthYear: profile?.birthYear ?? null,
        country: profile?.country ?? null,
        favoriteArtists: profile?.favoriteArtists ?? [],
        favoriteSongs: profile?.favoriteSongs ?? [],
        genrePreferences: profile?.genrePreferences ?? [],
      });
      posthog.capture("onboarding_completed", {
        has_birth_year: true,
        has_country: true,
        skipped_moments: momentCount === 0,
        moments_saved: momentCount,
      });
      try { if (user) await registerForPushNotifications(user.id); } catch {}
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + theme.spacing["3xl"] }]}>
        <Ionicons name="musical-notes-outline" size={36} color={theme.colors.textSecondary} style={styles.icon} />
        <Text style={styles.heading} accessibilityRole="header">Your soundtrack starts here.</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        {celebrationMoments.length > 0 && (
          <View style={styles.moments}>
            {celebrationMoments.map((m) => (
              <CelebrationEntryRow key={m.id} moment={m} theme={theme} />
            ))}
          </View>
        )}
      </View>

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Button label="Go to my journal" onPress={handleFinish} loading={saving} />
      </View>
    </View>
  );
}

// The saved entries as Journal rows: hairlines, the reflection in Newsreader,
// people as words.
function CelebrationEntryRow({ moment, theme }: { moment: Moment; theme: Theme }) {
  const rowStyles = useMemo(() => createRowStyles(theme), [theme]);
  return (
    <View style={rowStyles.row}>
      {moment.songArtworkUrl ? (
        <AppImage source={{ uri: moment.songArtworkUrl }} style={rowStyles.artwork} contentFit="cover" />
      ) : (
        <View style={rowStyles.artworkPlaceholder}>
          <Ionicons name="musical-note" size={20} color={theme.colors.textSecondary} />
        </View>
      )}
      <View style={rowStyles.info}>
        <Text style={rowStyles.songName} numberOfLines={1}>
          {moment.songTitle}
          <Text style={rowStyles.artist}>{`  ${moment.songArtist}`}</Text>
        </Text>
        {Boolean(moment.reflectionText) && (
          <Text style={rowStyles.reflection} numberOfLines={2}>
            {moment.reflectionText}
          </Text>
        )}
        {moment.people.length > 0 && (
          <Text style={rowStyles.meta} numberOfLines={1}>
            With {moment.people.slice(0, 3).join(", ")}
          </Text>
        )}
      </View>
    </View>
  );
}

function createRowStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    artwork: { width: 48, height: 48, borderRadius: theme.radii.sm },
    artworkPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    info: { flex: 1, gap: 3 },
    songName: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    artist: {
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    reflection: {
      ...theme.typography.reading,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.text,
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
    },
  });
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
      lineHeight: 24,
      color: theme.colors.textSecondary,
    },
    moments: {
      marginTop: theme.spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
      marginHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
    },
  });
}
