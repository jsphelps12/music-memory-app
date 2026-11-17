import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Moment } from "@/types";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";
import { fetchAlbumMoments } from "@/lib/browse";
import { pluralMoments } from "@/lib/utils";
import { ScreenHeader } from "@/components/ScreenHeader";

const STALE_TIME = 2 * 60 * 1000;

export default function AlbumScreen() {
  const { album, artist } = useLocalSearchParams<{ album: string; artist: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["album-moments", user?.id, album, artist],
    queryFn: () => fetchAlbumMoments(user!.id, album!, artist!),
    staleTime: STALE_TIME,
    enabled: !!user && !!album && !!artist,
  });

  const moments = data ?? [];

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

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

  const artworkUrl = moments[0]?.songArtworkUrl ?? null;

  return (
    <View style={styles.container}>
      <ScreenHeader title={album} style={styles.header} />

      {/* The cover, then artist (opens its page) and the count. */}
      <View style={styles.albumMeta}>
        {artworkUrl ? (
          <AppImage source={{ uri: artworkUrl }} style={styles.albumArtwork} />
        ) : (
          <ArtworkPlaceholder style={styles.albumArtwork} />
        )}
        <View style={styles.albumMetaText}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => router.push({ pathname: "/artist", params: { name: artist } })}
            accessibilityRole="link"
          >
            <Text style={styles.artistLink} numberOfLines={1}>{artist}</Text>
          </TouchableOpacity>
          <Text style={styles.momentCount}>
            {isLoading ? " " : pluralMoments(moments.length)}
          </Text>
        </View>
      </View>

      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => <SkeletonTimelineCard key={i} />)}
        </View>
      ) : isError && !data ? (
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} onBack={() => router.back()} />
      ) : moments.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No moments for this album yet.</Text>
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
      paddingBottom: 0,
    },
    albumMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
    },
    albumArtwork: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    albumMetaText: {
      flex: 1,
      minWidth: 0,
    },
    artistLink: {
      ...theme.typography.callout,
      color: theme.colors.text,
    },
    momentCount: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    bannerWrap: {
      paddingHorizontal: theme.spacing.xl,
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
      ...theme.typography.body,
      color: theme.colors.textSecondary,
    },
  });
}
