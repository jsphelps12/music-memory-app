import { useCallback, useEffect, useMemo } from "react";
import { View, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { ScreenHeader } from "@/components/ScreenHeader";
import { MomentCard } from "@/components/MomentCard";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { fetchSharedWithMe, markSharesViewed, SharedMoment, unviewedShareIds } from "@/lib/momentShares";
import { friendlyError } from "@/lib/errors";

const STALE_TIME = 2 * 60 * 1000;

/**
 * Everything friends have sent you (Sharing v2 direct shares). Phase 1 moved
 * this out of the Journal's "Shared with me" pill: the Journal is yours, and
 * this screen is reached from You or from the Journal's "new from friends"
 * row. Opening it marks everything it shows as seen.
 */
export default function SharedScreen() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  const { data: items = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["sharedWithMe", user?.id],
    queryFn: () => fetchSharedWithMe(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
    }, [refetch, dataUpdatedAt])
  );

  // The list is on screen, so everything in it counts as seen, and only that:
  // a share arriving while the screen is open keeps its dot until a fetch
  // shows it. The rows keep their dots until the next fetch, which is what you
  // want while reading.
  useEffect(() => {
    if (!user) return;
    const unseen = unviewedShareIds(items);
    if (unseen.length === 0) return;
    markSharesViewed(user.id, unseen)
      .then(() => queryClient.invalidateQueries({ queryKey: ["sharedUnviewed", user.id] }))
      .catch(() => {});
  }, [items, user, queryClient]);

  // Leaving is when the dots should go, so You's preview drops them too.
  useEffect(
    () => () => {
      if (user) queryClient.invalidateQueries({ queryKey: ["sharedWithMe", user.id] });
    },
    [user, queryClient]
  );

  // An unseen share gets an 8pt dot in the gutter beside its row, like the
  // preview on You. It stays until the next fetch (see above).
  const renderItem = useCallback(
    ({ item }: { item: SharedMoment }) => (
      <View>
        {!item.viewedAt ? <View style={styles.unreadDot} accessibilityLabel="New" /> : null}
        <MomentCard item={item.moment} allMoods={allMoods} />
      </View>
    ),
    [allMoods, styles]
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Shared with you" leading="back" />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : isError && items.length === 0 ? (
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.shareId}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ListHeaderComponent={items.length > 0 ? <View style={styles.listRule} /> : null}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={theme.colors.textSecondary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="paper-plane-outline"
              title="Nothing shared yet"
              subtitle="When a friend sends you a moment, it lands here."
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
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    list: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["4xl"],
    },
    listEmpty: {
      flexGrow: 1,
      justifyContent: "center",
    },
    // Rows on the page: a hairline heads the list, each row rules its foot.
    listRule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
    // In the 20pt gutter, level with the middle of the row's 56pt artwork.
    unreadDot: {
      position: "absolute",
      left: -14,
      top: theme.spacing.lg + 24,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot
    },
  });
}
