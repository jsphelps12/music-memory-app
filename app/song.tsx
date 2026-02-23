import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Moment } from "@/types";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";

export default function SongScreen() {
  const { title, artist } = useLocalSearchParams<{ title: string; artist: string }>();
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
      if (!user || !title || !artist) return;
      if (showLoading) setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("moments")
        .select("*")
        .eq("user_id", user.id)
        .eq("song_title", title)
        .eq("song_artist", artist)
        .order("moment_date", { ascending: false });

      if (fetchError) {
        setError(friendlyError(fetchError));
        setLoading(false);
        return;
      }

      setMoments((data ?? []).map(mapRowToMoment));
      setLoading(false);
    },
    [user, title, artist]
  );

  useFocusEffect(
    useCallback(() => {
      fetchMoments(true);
    }, [fetchMoments])
  );

  const goBack = useCallback(() => router.back(), [router]);

  const swipeDownGesture = Gesture.Pan()
    .activeOffsetY([-20, 20])
    .failOffsetX([-15, 15])
    .onEnd((e) => {
      "worklet";
      if (e.translationY > 80 || e.velocityY > 500) {
        runOnJS(goBack)();
      }
    });

  const swipeHorizGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      "worklet";
      if (Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 500) {
        runOnJS(goBack)();
      }
    });

  const swipeGesture = Gesture.Race(swipeDownGesture, swipeHorizGesture);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMoments(false);
    setRefreshing(false);
  }, [fetchMoments]);

  const renderItem = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      onPress={() => router.push(`/moment/${item.id}`)}
      allMoods={allMoods}
      showArtist={true}
    />
  ), [router, allMoods]);

  return (
    <GestureDetector gesture={swipeGesture}>
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.songHeader}>
        <Text style={styles.songTitle} numberOfLines={2}>{title}</Text>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.push({ pathname: "/artist", params: { name: artist } })}
        >
          <Text style={styles.artistLink} numberOfLines={1}>{artist}</Text>
        </TouchableOpacity>
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
          <Text style={styles.emptyText}>No moments for this song yet.</Text>
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
    </GestureDetector>
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
    songHeader: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    songTitle: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    artistLink: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
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
