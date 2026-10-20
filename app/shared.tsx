import { useCallback, useEffect, useMemo } from "react";
import { View, Text, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { IconButton } from "@/components/IconButton";
import { MomentCard } from "@/components/MomentCard";
import { ErrorState } from "@/components/ErrorState";
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
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
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

  const renderItem = useCallback(
    ({ item }: { item: SharedMoment }) => <MomentCard item={item.moment} allMoods={allMoods} />,
    [allMoods]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton name="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={styles.title}>Shared with you</Text>
      </View>

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
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={theme.colors.textSecondary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing shared yet</Text>
              <Text style={styles.emptyBody}>
                When a friend sends you a moment, it lands here.
              </Text>
            </View>
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
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginLeft: theme.spacing.xs,
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
    empty: {
      alignItems: "center",
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptyBody: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
  });
}
