import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  Dimensions,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";
import {
  fetchAlbums,
  fetchSharedAlbumActivity,
} from "@/lib/albums";
import { Album } from "@/types";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";

const GRID_GAP = 12;
const SCREEN_PAD = 16;
const CELL_SIZE = (Dimensions.get("window").width - SCREEN_PAD * 2 - GRID_GAP) / 2;

// ── Data ──────────────────────────────────────────────────────────────────────

async function fetchAlbumsScreen(userId: string) {
  const [albums, sharedActivity] = await Promise.all([
    fetchAlbums(userId),
    fetchSharedAlbumActivity(userId),
  ]);
  const activityMap = new Map(sharedActivity.map((a) => [a.collectionId, a.newMomentCount]));
  return { albums, activityMap };
}

// ── Album cell ────────────────────────────────────────────────────────────────

function AlbumCell({
  collection,
  newCount,
  onPress,
  theme,
}: {
  collection: Album;
  newCount: number;
  onPress: () => void;
  theme: any;
}) {
  const thumbUrl = collection.coverPhotoUrl
    ? getPublicPhotoThumbnailUrl(collection.coverPhotoUrl)
    : null;

  return (
    <TouchableOpacity style={styles.cell} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cellArt}>
        {thumbUrl ? (
          <AppImage source={{ uri: thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#E8825C", "#6B5F8C"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cellPlaceholderInner}>
              <Ionicons name="albums-outline" size={32} color="rgba(255,255,255,0.8)" />
            </View>
          </LinearGradient>
        )}
        {newCount > 0 && (
          <View style={[styles.newBadge, { backgroundColor: theme.colors.accent }]}>
            <Text style={[styles.newBadgeText, { fontFamily: theme.fonts.bodyBold }]}>{newCount} new</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cellName, { color: theme.colors.text, fontFamily: theme.fonts.bodySemibold }]} numberOfLines={1}>
        {collection.name}
      </Text>
      <Text style={[styles.cellSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {collection.role === "member" && collection.ownerName
          ? `by ${collection.ownerName} · ${pluralMoments(collection.momentCount)}`
          : collection.isPublic
          ? `Shared · ${pluralMoments(collection.momentCount)}`
          : pluralMoments(collection.momentCount)}
      </Text>
    </TouchableOpacity>
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
  const dynamicStyles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [newAlbumVisible, setNewAlbumVisible] = useState(false);

  const STALE_TIME = 2 * 60 * 1000;
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["collectionsScreen", user?.id],
    queryFn: () => fetchAlbumsScreen(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const albums = data?.albums ?? [];
  const activityMap = data?.activityMap ?? new Map();

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
    queryClient.invalidateQueries({ queryKey: ["collectionsScreen", user?.id] });
  }, [queryClient, user?.id]);

  const isEmpty = personalAlbums.length === 0 && sharedAlbums.length === 0;

  const listData = useMemo<SectionItem[]>(() => {
    const rows: SectionItem[] = [];
    if (personalAlbums.length > 0) {
      rows.push({ type: "sectionHeader", label: "MY ALBUMS" });
      for (let i = 0; i < personalAlbums.length; i += 2) {
        rows.push({ type: "row", items: personalAlbums.slice(i, i + 2) });
      }
    }
    if (sharedAlbums.length > 0) {
      rows.push({ type: "sectionHeader", label: "SHARED" });
      for (let i = 0; i < sharedAlbums.length; i += 2) {
        rows.push({ type: "row", items: sharedAlbums.slice(i, i + 2) });
      }
    }
    return rows;
  }, [personalAlbums, sharedAlbums]);

  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    if (item.type === "sectionHeader") {
      return (
        <Text style={[dynamicStyles.sectionLabel, { color: theme.colors.textTertiary }]}>
          {item.label}
        </Text>
      );
    }

    return (
      <View style={dynamicStyles.gridRow}>
        {item.items.map((col) => (
          <AlbumCell
            key={col.id}
            collection={col}
            newCount={activityMap.get(col.id) ?? 0}
            onPress={() => handleTapAlbum(col)}
            theme={theme}
          />
        ))}
        {item.items.length === 1 && <View style={styles.cell} />}
      </View>
    );
  }, [activityMap, dynamicStyles, theme, handleTapAlbum]);

  if (isLoading) {
    return (
      <View style={[dynamicStyles.container, dynamicStyles.center]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  return (
    <View style={[dynamicStyles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[dynamicStyles.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[dynamicStyles.headerTitle, { color: theme.colors.text }]}>Albums</Text>
        <IconButton name="add-outline" onPress={() => setNewAlbumVisible(true)} />
      </View>

      {isEmpty ? (
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
          contentContainerStyle={dynamicStyles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={theme.colors.accent} />
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
    container: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 56,
      paddingBottom: 12,
      paddingHorizontal: SCREEN_PAD,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
    },
    listContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: 16,
      paddingBottom: 40,
      gap: 0,
    },
    sectionLabel: {
      fontSize: 10,
      fontFamily: theme.fonts.bodyBold,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginTop: 20,
      marginBottom: 10,
    },
    gridRow: {
      flexDirection: "row",
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    // Invite card
    inviteCard: {
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      marginBottom: 8,
    },
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 10,
    },
    inviteIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    inviteName: {
      fontSize: 14,
      fontFamily: theme.fonts.bodySemibold,
    },
    inviteSub: {
      fontSize: 12,
      marginTop: 1,
    },
    inviteActions: {
      flexDirection: "row",
      gap: 8,
    },
    inviteBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
    },
    inviteBtnAccept: {
      borderWidth: 0,
    },
    inviteBtnText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
    },
  });
}

const styles = StyleSheet.create({
  cell: {
    width: CELL_SIZE,
  },
  cellArt: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  cellPlaceholderInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 10,
  },
  cellName: {
    fontSize: 13,
    marginTop: 7,
  },
  cellSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
