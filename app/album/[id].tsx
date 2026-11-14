import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { AlbumShareSheet } from "@/components/AlbumShareSheet";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { AlbumMosaic } from "@/components/AlbumMosaic";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { MOODS } from "@/constants/Moods";
import { AlbumNotFoundError, fetchAlbumDetail, markAlbumViewed } from "@/lib/albums";
import { DEFAULT_SCREEN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { Moment } from "@/types";
import { pluralMoments } from "@/lib/utils";

function groupByMonth(moments: Moment[]): { title: string; data: Moment[] }[] {
  const grouped: Record<string, Moment[]> = {};
  for (const m of moments) {
    const key = m.momentDate
      ? new Date(m.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "No date";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  return Object.entries(grouped).map(([title, data]) => ({ title, data }));
}

const STALE_TIME = DEFAULT_SCREEN_STALE;

const ART_SIZE = Math.round(Dimensions.get("window").width * 0.72);
// Room above the cover for the floating controls (a 32pt disc plus air).
const HEADER_CLEARANCE = 52;

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const queryClient = useQueryClient();

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["album", id, user?.id],
    queryFn: () => fetchAlbumDetail(id!, user!.id),
    staleTime: STALE_TIME,
    enabled: !!user && !!id,
    // Same single retry as the app default, but not for an album that's gone.
    retry: (failureCount, err) => !(err instanceof AlbumNotFoundError) && failureCount < 1,
  });

  const collection = data?.album ?? null;
  const moments = useMemo(() => data?.moments ?? [], [data?.moments]);

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  useEffect(() => {
    if (!data?.album || !user) return;
    // Clearing the unread marker changes the You tab's badge and the "N new"
    // pills on the Albums screen and You's album row — all in other caches,
    // so refresh them.
    // Deliberately no albumId: this screen's own data was just fetched and the
    // viewed marker doesn't affect it.
    markAlbumViewed(id!, user.id, data.album.role)
      .then(() => invalidateAlbumCaches(queryClient, user.id))
      .catch(() => {});
  }, [data?.album?.id]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const sections = useMemo(() => groupByMonth(moments), [moments]);

  // The album's face when it has no cover photo: its songs' artwork, the same
  // mosaic the Albums grid shows (it used to be the retired brand gradient).
  const artworks = useMemo(() => {
    const list: string[] = [];
    for (const m of moments) {
      if (m.songArtworkUrl && !list.includes(m.songArtworkUrl)) list.push(m.songArtworkUrl);
      if (list.length === 4) break;
    }
    return list;
  }, [moments]);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      collectionId={collection?.id}
      collectionRole={collection?.role}
    />
  ), [allMoods, collection?.id, collection?.role]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  if (isError && !data) {
    // A missing album won't come back on retry; anything else (offline, a
    // timeout) might.
    if (error instanceof AlbumNotFoundError) {
      return (
        <ErrorState
          message="This album isn't available. It may have been deleted, or you're no longer a member."
          onBack={() => router.back()}
        />
      );
    }
    return (
      <ErrorState message={friendlyError(error)} onRetry={() => refetch()} onBack={() => router.back()} />
    );
  }

  const isShared = collection?.isPublic;
  const isOwner = collection?.role === "owner";

  const subLine = collection?.role === "member" && collection?.ownerName
    ? `by ${collection.ownerName} · ${pluralMoments(moments.length)}`
    : isShared
    ? `Shared · ${pluralMoments(moments.length)}`
    : pluralMoments(moments.length);

  const listHeader = (
    <View style={[styles.listHeader, { paddingTop: insets.top + HEADER_CLEARANCE }]}>
      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {/* Square artwork, lifted (the shadow sits on a wrapper so the
          mosaic's clipping doesn't cut it off) */}
      <View style={styles.artLift}>
        <AlbumMosaic
          coverPhotoPath={collection?.coverPhotoUrl}
          artworks={artworks}
          style={styles.art}
        />
      </View>

      <Text style={styles.collectionTitle} accessibilityRole="header" numberOfLines={3}>
        {collection?.name ?? "Album"}
      </Text>

      <Text style={styles.collectionSub}>{subLine}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMoment}
        renderSectionHeader={({ section: { title } }) => (
          <SectionLabel style={styles.sectionHeader}>{title}</SectionLabel>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="Nothing in this album yet"
            subtitle={isShared ? "Tap + to add the first moment — members can contribute too." : "Tap + to add your first moment to this album."}
          />
        }
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={handleRefresh} tintColor={theme.colors.textSecondary} />
        }
      />

      {/* Floating controls, always visible over the scroll: one disc size
          for all three (they float over the cover and the list). */}
      <View
        style={[styles.floatingControls, { top: insets.top + theme.spacing.sm }]}
        pointerEvents="box-none"
      >
        <IconButton
          variant="filled"
          name="chevron-back"
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <View style={styles.floatingRight}>
          {/* Everyone who can open this screen is the owner or a member, and
              members can already contribute to shared albums — so no role gate. */}
          <IconButton
            variant="filled"
            name="add"
            accessibilityLabel="Add a moment to this album"
            onPress={() => router.push({ pathname: "/create", params: { collectionId: id! } })}
          />
          <IconButton
            variant="filled"
            name={isOwner ? "settings-outline" : "ellipsis-horizontal"}
            accessibilityLabel={isOwner ? "Album settings" : "Album options"}
            onPress={() => setShareSheetVisible(true)}
          />
        </View>
      </View>

      {/* Share sheet */}
      {collection && shareSheetVisible && (
        <AlbumShareSheet
          visible={shareSheetVisible}
          collection={collection}
          onClose={() => setShareSheetVisible(false)}
          onUpdated={(updated) =>
            queryClient.setQueryData(["album", id, user?.id], (old: any) =>
              old ? { ...old, album: updated } : old
            )
          }
          onLeft={() => {
            router.back();
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    listHeader: {
      alignItems: "center",
      paddingHorizontal: theme.spacing["2xl"],
      paddingBottom: theme.spacing.sm,
    },
    bannerWrap: {
      alignSelf: "stretch",
    },
    // DESIGN.md "Artwork lift": album artwork shown large.
    artLift: {
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.artworkPlaceholder,
      shadowColor: theme.shadows.card.shadowColor,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: theme.isDark ? 0.5 : 0.25,
      shadowRadius: 24,
      elevation: 8,
    },
    art: {
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: theme.radii.md,
    },
    collectionTitle: {
      ...theme.typography.headline,
      color: theme.colors.text,
      textAlign: "center",
      marginTop: theme.spacing["2xl"],
    },
    collectionSub: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },
    floatingControls: {
      position: "absolute",
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    floatingRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    sectionHeader: {
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["4xl"],
    },
  });
}
