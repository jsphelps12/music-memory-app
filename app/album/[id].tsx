import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { LinearGradient } from "expo-linear-gradient";

import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";
import { MomentCard } from "@/components/MomentCard";
import { AlbumShareSheet } from "@/components/AlbumShareSheet";
import { IconButton } from "@/components/IconButton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { MOODS } from "@/constants/Moods";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { fetchSharedAlbumMoments, markAlbumViewed } from "@/lib/albums";
import { friendlyError } from "@/lib/errors";
import { Album, Moment } from "@/types";
import { pluralMoments } from "@/lib/utils";

function groupByMonth(moments: Moment[]): { title: string; data: Moment[] }[] {
  const grouped: Record<string, Moment[]> = {};
  for (const m of moments) {
    const key = m.momentDate
      ? new Date(m.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "No Date";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  return Object.entries(grouped).map(([title, data]) => ({ title, data }));
}

const STALE_TIME = 2 * 60 * 1000;

async function fetchAlbumData(id: string, userId: string): Promise<{ album: Album; moments: Moment[] }> {
  // Try owned first
  const { data: owned } = await supabase
    .from("collections")
    .select("id, user_id, name, created_at, is_public, invite_code, cover_photo_url, collection_moments(moment_id)")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (owned) {
    const col: Album = {
      id: owned.id,
      userId: owned.user_id,
      name: owned.name,
      createdAt: owned.created_at,
      momentCount: (owned.collection_moments ?? []).length,
      isPublic: owned.is_public ?? false,
      inviteCode: owned.invite_code ?? undefined,
      role: "owner",
      coverPhotoUrl: owned.cover_photo_url ?? undefined,
    };
    const moments = await loadMoments(col);
    return { album: col, moments };
  }

  // Try member
  const { data: membership } = await supabase
    .from("collection_members")
    .select("collection_id")
    .eq("collection_id", id)
    .eq("user_id", userId)
    .single();

  if (membership) {
    const { data: joined } = await supabase
      .from("collections")
      .select("id, user_id, name, created_at, is_public, invite_code, cover_photo_url, collection_moments(moment_id)")
      .eq("id", id)
      .single();

    if (joined) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", joined.user_id)
        .single();

      const col: Album = {
        id: joined.id,
        userId: joined.user_id,
        name: joined.name,
        createdAt: joined.created_at,
        momentCount: (joined.collection_moments ?? []).length,
        isPublic: joined.is_public ?? false,
        inviteCode: joined.invite_code ?? undefined,
        role: "member",
        ownerName: ownerProfile?.display_name ?? undefined,
        coverPhotoUrl: joined.cover_photo_url ?? undefined,
      };
      const moments = await loadMoments(col);
      return { album: col, moments };
    }
  }

  throw new Error("Album not found.");
}

async function loadMoments(col: Album): Promise<Moment[]> {
  if (col.isPublic) {
    return fetchSharedAlbumMoments(col.id);
  }
  const { data: cm } = await supabase
    .from("collection_moments")
    .select("moment_id")
    .eq("collection_id", col.id);
  const ids = (cm ?? []).map((r: any) => r.moment_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .in("id", ids)
    .order("moment_date", { ascending: false });
  return (data ?? []).map(mapRowToMoment);
}

const ART_SIZE = Math.round(Dimensions.get("window").width * 0.72);

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const queryClient = useQueryClient();

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["album", id, user?.id],
    queryFn: () => fetchAlbumData(id!, user!.id),
    staleTime: STALE_TIME,
    enabled: !!user && !!id,
  });

  const collection = data?.album ?? null;
  const moments = data?.moments ?? [];

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  useEffect(() => {
    if (!data?.album || !user) return;
    markAlbumViewed(id!, user.id, data.album.role).catch(() => {});
  }, [data?.album?.id]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const sections = useMemo(() => groupByMonth(moments), [moments]);

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
    return (
      <ErrorState message={friendlyError(error)} onRetry={() => refetch()} onBack={() => router.back()} />
    );
  }

  const isShared = collection?.isPublic;
  const isOwner = collection?.role === "owner";

  const coverUrl = collection?.coverPhotoUrl
    ? getPublicPhotoThumbnailUrl(collection.coverPhotoUrl)
    : null;

  const subLine = collection?.role === "member" && collection?.ownerName
    ? `by ${collection.ownerName} · ${pluralMoments(moments.length)}`
    : isShared
    ? `Shared · ${pluralMoments(moments.length)}`
    : pluralMoments(moments.length);

  const listHeader = (
    <View style={styles.listHeader}>
      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {/* Square artwork */}
      <View style={[styles.artContainer, {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
      }]}>
        {coverUrl ? (
          <AppImage source={{ uri: coverUrl }} style={styles.art} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#E8825C", "#6B5F8C"]} style={styles.art}>
            <Ionicons name="albums-outline" size={48} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
        )}
      </View>

      {/* Title */}
      <Text style={[styles.collectionTitle, { color: theme.colors.text }]}>
        {collection?.name ?? "Album"}
      </Text>

      {/* Sub-line */}
      <Text style={[styles.collectionSub, { color: theme.colors.textSecondary }]}>
        {subLine}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMoment}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={[styles.sectionHeader, { color: theme.colors.textSecondary, backgroundColor: theme.colors.background }]}>
            {title}
          </Text>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="Nothing in this album yet"
            subtitle={isShared ? "Members can add moments to this album." : "Add moments to this album from the timeline."}
          />
        }
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={handleRefresh} tintColor={theme.colors.accent} />
        }
      />

      {/* Floating controls — always visible above scroll */}
      <View style={styles.floatingControls} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.floatingBtn, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <IconButton
          name={isOwner ? "settings-outline" : "ellipsis-horizontal"}
          onPress={() => setShareSheetVisible(true)}
        />
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
          onLeft={(collectionId) => {
            queryClient.setQueryData(["sharedScreen", user?.id], (old: any) =>
              old ? {
                ...old,
                sharedAlbums: old.sharedAlbums.filter(
                  (c: any) => c.collectionId !== collectionId
                ),
              } : old
            );
            router.back();
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    listHeader: {
      alignItems: "center",
      paddingTop: 88,
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
    bannerWrap: {
      alignSelf: "stretch",
    },
    artContainer: {
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: 12,
      overflow: "hidden",
    },
    art: {
      width: ART_SIZE,
      height: ART_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    collectionTitle: {
      fontSize: 22,
      fontFamily: theme.fonts.bodySemibold,
      textAlign: "center",
      marginTop: 20,
    },
    collectionSub: {
      fontSize: 14,
      marginTop: 4,
      textAlign: "center",
    },
    floatingControls: {
      position: "absolute",
      top: 52,
      left: theme.spacing.md,
      right: theme.spacing.md,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    floatingBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeader: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 40,
    },
  });
}
