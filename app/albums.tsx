import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { IconButton } from "@/components/IconButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { AlbumMosaic } from "@/components/AlbumMosaic";
import { fetchAlbumsOverview } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { DEFAULT_SCREEN_STALE } from "@/lib/queryConfig";
import { Album } from "@/types";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";

const GRID_GAP = 12;
// The page gutter (theme.spacing.xl), matching ScreenHeader's title.
const SCREEN_PAD = 20;
const CELL_SIZE = (Dimensions.get("window").width - SCREEN_PAD * 2 - GRID_GAP) / 2;

const STALE_TIME = DEFAULT_SCREEN_STALE;

type Styles = ReturnType<typeof createStyles>;

// ── Album cell ────────────────────────────────────────────────────────────────

function AlbumCell({
  collection,
  hasNew,
  artworks,
  onPress,
  styles,
}: {
  collection: Album;
  hasNew: boolean;
  artworks: string[];
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasNew ? `${collection.name}, new moments` : collection.name}
    >
      <View style={styles.cellArt}>
        <AlbumMosaic coverPhotoPath={collection.coverPhotoUrl} artworks={artworks} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.cellNameRow}>
        <Text style={styles.cellName} numberOfLines={1}>
          {collection.name}
        </Text>
        {/* New activity is a dot, never a count (DESIGN.md). */}
        {hasNew ? <View style={styles.newDot} /> : null}
      </View>
      <Text style={styles.cellSub} numberOfLines={1}>
        {collection.role === "member" && collection.ownerName
          ? `by ${collection.ownerName} · ${pluralMoments(collection.momentCount)}`
          : collection.isPublic
          ? `Shared · ${pluralMoments(collection.momentCount)}`
          : pluralMoments(collection.momentCount)}
      </Text>
    </Pressable>
  );
}

type SectionItem =
  | { type: "sectionHeader"; label: string }
  | { type: "row"; items: Album[] };

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AlbumsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [newAlbumVisible, setNewAlbumVisible] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["collectionsScreen", user?.id],
    queryFn: () => fetchAlbumsOverview(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // A failed background refetch keeps the albums on screen with a banner;
  // only a failed first load replaces the screen.
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const albums = useMemo(() => data?.albums ?? [], [data?.albums]);
  const newCounts = useMemo(() => data?.newCounts ?? {}, [data?.newCounts]);
  const artworkMap = useMemo(() => data?.artworks ?? {}, [data?.artworks]);

  const personalAlbums = useMemo(
    () => albums.filter((c) => c.role === "owner" && !c.isPublic),
    [albums]
  );
  const sharedAlbums = useMemo(
    () => albums.filter((c) => (c.role === "owner" && c.isPublic) || c.role === "member"),
    [albums]
  );

  const handleTapAlbum = useCallback((col: Album) => {
    router.push({ pathname: "/album/[id]" as any, params: { id: col.id } });
  }, [router]);

  const handleNewAlbumClose = useCallback(() => {
    setNewAlbumVisible(false);
    invalidateAlbumCaches(queryClient, user?.id);
  }, [queryClient, user?.id]);

  const isEmpty = personalAlbums.length === 0 && sharedAlbums.length === 0;

  const listData = useMemo<SectionItem[]>(() => {
    const rows: SectionItem[] = [];
    if (personalAlbums.length > 0) {
      rows.push({ type: "sectionHeader", label: "My albums" });
      for (let i = 0; i < personalAlbums.length; i += 2) {
        rows.push({ type: "row", items: personalAlbums.slice(i, i + 2) });
      }
    }
    if (sharedAlbums.length > 0) {
      rows.push({ type: "sectionHeader", label: "Shared" });
      for (let i = 0; i < sharedAlbums.length; i += 2) {
        rows.push({ type: "row", items: sharedAlbums.slice(i, i + 2) });
      }
    }
    return rows;
  }, [personalAlbums, sharedAlbums]);

  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    if (item.type === "sectionHeader") {
      return <SectionLabel style={styles.sectionLabel}>{item.label}</SectionLabel>;
    }

    return (
      <View style={styles.gridRow}>
        {item.items.map((col) => (
          <AlbumCell
            key={col.id}
            collection={col}
            hasNew={(newCounts[col.id] ?? 0) > 0}
            artworks={artworkMap[col.id] ?? []}
            onPress={() => handleTapAlbum(col)}
            styles={styles}
          />
        ))}
        {item.items.length === 1 && <View style={styles.cell} />}
      </View>
    );
  }, [newCounts, artworkMap, styles, handleTapAlbum]);

  // A pushed screen since Phase 1 moved albums out of the tab bar and into
  // You, so it gets a back chevron.
  const header = (
    <ScreenHeader
      title="Albums"
      leading="back"
      right={
        <IconButton
          name="add"
          onPress={() => setNewAlbumVisible(true)}
          accessibilityLabel="New album"
        />
      }
    />
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {isError && !data ? (
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon="albums-outline"
          title="No albums yet"
          subtitle="Create an album to organize your moments, or join a shared album with friends."
          action={{ label: "Create Album", onPress: () => setNewAlbumVisible(true) }}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => `${item.type}-${i}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={theme.colors.textSecondary} />
          }
          renderItem={renderItem}
        />
      )}

      <CreateAlbumSheet
        visible={newAlbumVisible}
        onClose={handleNewAlbumClose}
        userId={user?.id ?? ""}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    bannerWrap: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: theme.spacing.sm,
    },
    listContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingBottom: theme.spacing["4xl"],
    },
    sectionLabel: {
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    gridRow: {
      flexDirection: "row",
      gap: GRID_GAP,
      marginBottom: theme.spacing.xl,
    },
    cell: {
      width: CELL_SIZE,
    },
    pressed: { opacity: 0.8 },
    cellArt: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    cellNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: theme.spacing.sm,
    },
    cellName: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
      flexShrink: 1,
    },
    newDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    cellSub: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}
