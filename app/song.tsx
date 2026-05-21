import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Moment } from "@/types";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";
import { fetchSongMoments } from "@/lib/browse";

const STALE_TIME = 2 * 60 * 1000;

export default function SongScreen() {
  const { title, artist } = useLocalSearchParams<{ title: string; artist: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data: moments = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["song-moments", user?.id, title, artist],
    queryFn: () => fetchSongMoments(user!.id, title!, artist!),
    staleTime: STALE_TIME,
    enabled: !!user && !!title && !!artist,
  });

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderItem = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      showArtist={true}
    />
  ), [allMoods]);

  return (
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
        {!isLoading && (
          <Text style={styles.momentCount}>
            {moments.length} {moments.length === 1 ? "moment" : "moments"}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => <SkeletonTimelineCard key={i} />)}
        </View>
      ) : isError ? (
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} onBack={() => router.back()} />
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
              refreshing={isFetching && !isLoading}
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
    songHeader: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
    },
    songTitle: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
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
