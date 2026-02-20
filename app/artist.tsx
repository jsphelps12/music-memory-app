import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Moment, MoodOption } from "@/types";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { friendlyError } from "@/lib/errors";

export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const fetchMoments = useCallback(
    async (showLoading: boolean) => {
      if (!user || !name) return;
      if (showLoading) setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("moments")
        .select("*")
        .eq("user_id", user.id)
        .eq("song_artist", name)
        .order("moment_date", { ascending: false });

      if (fetchError) {
        setError(friendlyError(fetchError));
        setLoading(false);
        return;
      }

      setMoments(
        (data ?? []).map((row: any) => ({
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
        }))
      );
      setLoading(false);
    },
    [user, name]
  );

  useFocusEffect(
    useCallback(() => {
      fetchMoments(true);
    }, [fetchMoments])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMoments(false);
    setRefreshing(false);
  }, [fetchMoments]);

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getMood = (value: MoodOption | null) =>
    value ? allMoods.find((m) => m.value === value) : undefined;

  const renderItem = ({ item }: { item: Moment }) => {
    const mood = getMood(item.mood);
    return (
      <TouchableOpacity
        style={[styles.card, !theme.isDark && theme.shadows.card]}
        activeOpacity={0.8}
        onPress={() => router.push(`/moment/${item.id}`)}
      >
        {item.songArtworkUrl ? (
          <Image source={{ uri: item.songArtworkUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}
        <View style={styles.cardContent}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.songTitle}</Text>
          {item.reflectionText ? (
            <Text style={styles.reflection} numberOfLines={2}>{item.reflectionText}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            {mood ? (
              <View style={styles.moodChip}>
                <Text style={styles.moodChipText}>{mood.emoji} {mood.label}</Text>
              </View>
            ) : null}
            <Text style={styles.date}>{formatDay(item.momentDate)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.artistHeader}>
        <Text style={styles.artistName} numberOfLines={2}>{name}</Text>
        {!loading && (
          <Text style={styles.momentCount}>
            {moments.length} {moments.length === 1 ? "moment" : "moments"}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => <SkeletonTimelineCard key={i} />)}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchMoments(true)} onBack={() => router.back()} />
      ) : moments.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No moments for this artist yet.</Text>
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
      paddingTop: 60,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    backText: {
      fontSize: theme.fontSize.lg,
      color: theme.colors.accent,
    },
    artistHeader: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    artistName: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    momentCount: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
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
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
    },
    emptyText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
    },
  });
}
