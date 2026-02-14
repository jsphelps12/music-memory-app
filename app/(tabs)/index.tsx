import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { Moment, MoodOption } from "@/types";

const REFETCH_COOLDOWN_MS = 2000;

export default function TimelineScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const lastFetchTime = useRef(0);

  const fetchMoments = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setBannerError("");
      if (showLoading) setError("");
      const { data, error: fetchError } = await supabase
        .from("moments")
        .select("*")
        .eq("user_id", user!.id)
        .order("moment_date", { ascending: false });

      if (fetchError) {
        if (showLoading) {
          setError(friendlyError(fetchError));
        } else {
          setBannerError(friendlyError(fetchError));
        }
        setLoading(false);
        return;
      }

      const mapped: Moment[] = (data ?? []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        songTitle: row.song_title,
        songArtist: row.song_artist,
        songAlbumName: row.song_album_name,
        songArtworkUrl: row.song_artwork_url,
        songAppleMusicId: row.song_apple_music_id,
        songPreviewUrl: row.song_preview_url ?? null,
        reflectionText: row.reflection_text,
        photoUrls: row.photo_urls ?? [],
        mood: row.mood,
        people: row.people ?? [],
        location: row.location,
        momentDate: row.moment_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      setMoments(mapped);
      setLoading(false);
      lastFetchTime.current = Date.now();
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        fetchMoments(true);
      } else if (elapsed >= REFETCH_COOLDOWN_MS) {
        fetchMoments(false);
      }
    }, [fetchMoments])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMoments(false);
    setRefreshing(false);
  }, [fetchMoments]);

  const sections = useMemo(() => {
    const grouped: Record<string, Moment[]> = {};
    for (const m of moments) {
      const date = new Date(m.momentDate + "T00:00:00");
      const key = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [moments]);

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getMood = (value: MoodOption | null) =>
    value ? MOODS.find((m) => m.value === value) : undefined;

  const renderMoment = ({ item }: { item: Moment }) => {
    const mood = getMood(item.mood);

    return (
      <TouchableOpacity
        style={[styles.card, !theme.isDark && theme.shadows.card]}
        activeOpacity={0.8}
        onPress={() => router.push(`/moment/${item.id}`)}
      >
        {item.songArtworkUrl ? (
          <Image
            source={{ uri: item.songArtworkUrl }}
            style={styles.artwork}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}
        <View style={styles.cardContent}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {item.songTitle}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {item.songArtist}
          </Text>
          {item.reflectionText ? (
            <Text style={styles.reflection} numberOfLines={2}>
              {item.reflectionText}
            </Text>
          ) : null}
          <View style={styles.cardMeta}>
            {mood ? (
              <View style={styles.moodChip}>
                <Text style={styles.moodChipText}>
                  {mood.emoji} {mood.label}
                </Text>
              </View>
            ) : null}
            <Text style={styles.date}>{formatDay(item.momentDate)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = bannerError ? (
    <ErrorBanner
      message={bannerError}
      onRetry={() => fetchMoments(false)}
      onDismiss={() => setBannerError("")}
    />
  ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Moments</Text>
      </View>

      {loading && moments.length === 0 ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonTimelineCard key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => fetchMoments(true)}
        />
      ) : moments.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconContainer}>
            <Ionicons
              name="musical-notes"
              size={40}
              color={theme.colors.textTertiary}
            />
          </View>
          <Text style={styles.emptyTitle}>No moments yet</Text>
          <Text style={styles.emptySubtitle}>
            A moment is a song paired with a memory —{"\n"}what you felt, who
            you were with, and why it mattered.
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push("/(tabs)/create")}
            activeOpacity={0.7}
          >
            <Text style={styles.ctaButtonText}>Create Your First Moment</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderMoment}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.text}
            />
          }
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 80,
      paddingBottom: theme.spacing.lg,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.backgroundTertiary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.xl,
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptySubtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    ctaButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["2xl"] + 4,
      borderRadius: theme.radii.md,
      marginTop: theme.spacing.xl,
    },
    ctaButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    skeletonList: {
      paddingHorizontal: theme.spacing.xl,
    },
    sectionHeader: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.md,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["4xl"],
    },
    card: {
      flexDirection: "row",
      backgroundColor: theme.colors.cardBg,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.md,
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    cardContent: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    reflection: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 6,
      lineHeight: 20,
    },
    cardMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
      flex: 1,
    },
    moodChip: {
      paddingHorizontal: 10,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
    },
    moodChipText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.chipText,
    },
    date: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginLeft: "auto",
    },
  });
}
