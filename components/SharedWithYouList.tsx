import { useCallback, useEffect, useMemo } from "react";
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { MomentCard } from "@/components/MomentCard";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { fetchSharedWithMe, markSharesViewed, SharedMoment, unviewedShareIds } from "@/lib/momentShares";
import { friendlyError } from "@/lib/errors";
import { PROFILE_STATS_STALE } from "@/lib/queryConfig";

/** `["sharedWithMe", userId]`: one staleTime for every observer (lib/queryConfig.ts). */
const STALE_TIME = PROFILE_STATS_STALE;

/**
 * The "Shared with you" inbox: everything friends have sent this user
 * (Sharing v2 direct shares), newest first. The Journal's Shared pane uses it
 * to decide whether there's anything to switch to; the list below reads the
 * same cache.
 */
export function useSharedWithMe() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sharedWithMe", user?.id],
    queryFn: () => fetchSharedWithMe(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });
}

interface Props {
  /**
   * The list is on screen: what it shows counts as seen. The Journal keeps
   * this pane mounted behind Yours, so it passes true only while the Shared
   * pane is the one showing; app/shared.tsx always passes true.
   */
  active: boolean;
  /** Extra list padding, e.g. clearing the floating capture button. */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * The moments friends sent you, as MomentCards with an unread dot beside the
 * ones not yet seen. Shown in the Journal's Shared pane and on app/shared.tsx
 * (still reached from You, notifications and links).
 */
export function SharedWithYouList({ active, contentContainerStyle }: Props) {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  const { data: items = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useSharedWithMe();

  useFocusEffect(
    useCallback(() => {
      if (active && Date.now() - dataUpdatedAt > STALE_TIME) refetch();
    }, [active, refetch, dataUpdatedAt])
  );

  // The list is on screen, so everything in it counts as seen, and only that:
  // a share arriving while it's open keeps its dot until a fetch shows it.
  // The rows keep their dots until the next fetch, which is what you want
  // while reading.
  useEffect(() => {
    if (!active || !userId) return;
    const unseen = unviewedShareIds(items);
    if (unseen.length === 0) return;
    markSharesViewed(userId, unseen)
      .then(() => queryClient.invalidateQueries({ queryKey: ["sharedUnviewed", userId] }))
      .catch(() => {});
  }, [active, items, userId, queryClient]);

  // Leaving (the pane, or the screen) is when the dots should go, so the
  // next look, and You's preview, drop them too.
  useEffect(() => {
    if (!active || !userId) return;
    return () => {
      queryClient.invalidateQueries({ queryKey: ["sharedWithMe", userId] });
    };
  }, [active, userId, queryClient]);

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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  if (isError && items.length === 0) {
    return <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.shareId}
      renderItem={renderItem}
      contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty, contentContainerStyle]}
      ListHeaderComponent={items.length > 0 ? <View style={styles.listRule} /> : undefined}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
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
      showsVerticalScrollIndicator={false}
      testID="shared-with-you-list"
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
