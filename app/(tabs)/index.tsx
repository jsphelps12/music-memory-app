import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
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
  const lastFetchTime = useRef(0);

  const fetchMoments = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from("moments")
        .select("*")
        .eq("user_id", user!.id)
        .order("moment_date", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
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
            <Text style={styles.date}>{formatDate(item.momentDate)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchMoments(true)}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : moments.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No moments yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first music memory
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push("/(tabs)/create")}
          >
            <Text style={styles.ctaButtonText}>Create Your First Moment</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={renderMoment}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
    errorText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
      textAlign: "center",
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
    retryButton: {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing["2xl"],
      marginTop: theme.spacing.lg,
    },
    retryButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    skeletonList: {
      paddingHorizontal: theme.spacing.xl,
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
