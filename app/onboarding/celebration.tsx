import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
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

export default function OnboardingCelebrationScreen() {
  const router = useRouter();
  const { completeOnboarding, profile, user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      ? "Your timeline is ready. Start adding memories anytime."
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
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="musical-note" size={36} color={theme.colors.accent} />
        </View>
        <Text style={styles.heading}>Your soundtrack starts here.</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        {celebrationMoments.length > 0 && (
          <View style={styles.moments}>
            {celebrationMoments.map((m) => (
              <CelebrationMomentCard key={m.id} moment={m} theme={theme} />
            ))}
          </View>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg, opacity: saving ? 0.7 : 1 }]}
          onPress={handleFinish}
          activeOpacity={0.8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Go to my timeline →</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CelebrationMomentCard({ moment, theme }: { moment: Moment; theme: Theme }) {
  return (
    <View style={[cardStyles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.cardBg }]}>
      <View style={cardStyles.row}>
        {moment.songArtworkUrl ? (
          <Image source={{ uri: moment.songArtworkUrl }} style={cardStyles.artwork} contentFit="cover" />
        ) : (
          <View style={[cardStyles.artworkPlaceholder, { backgroundColor: theme.colors.chipBg }]}>
            <Ionicons name="musical-note" size={20} color={theme.colors.textTertiary} />
          </View>
        )}
        <View style={cardStyles.info}>
          <Text style={[cardStyles.songName, { color: theme.colors.text }]} numberOfLines={1}>
            {moment.songTitle}
          </Text>
          <Text style={[cardStyles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {moment.songArtist}
          </Text>
        </View>
      </View>
      {Boolean(moment.reflectionText) && (
        <Text style={[cardStyles.reflection, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {moment.reflectionText}
        </Text>
      )}
      {moment.people.length > 0 && (
        <View style={cardStyles.chips}>
          {moment.people.slice(0, 3).map((p) => (
            <View key={p} style={[cardStyles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[cardStyles.chipText, { color: theme.colors.textSecondary }]}>@ {p}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  artwork: { width: 44, height: 44, borderRadius: 6 },
  artworkPlaceholder: { width: 44, height: 44, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  songName: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  artist: { fontSize: 13 },
  reflection: { fontSize: 13, lineHeight: 18, fontStyle: "italic" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  chipText: { fontSize: 12 },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 64,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.accentBg,
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
      lineHeight: 24,
    },
    moments: {
      marginTop: theme.spacing.xl,
      gap: 10,
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
