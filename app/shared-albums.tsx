import { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import {
  markAlbumViewed,
  SharedAlbumActivity,
} from "@/lib/albums";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";
import { fetchSharedScreenData } from "@/lib/sharedScreen";
import { pluralMoments } from "@/lib/utils";

export default function SharedAlbumsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sharedScreen", user?.id],
    queryFn: () => fetchSharedScreenData(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const sharedAlbums = data?.sharedAlbums ?? [];

  const handleTap = useCallback((item: SharedAlbumActivity) => {
    markAlbumViewed(item.collectionId, user!.id, item.role).catch(() => {});
    queryClient.setQueryData(["sharedScreen", user?.id], (old: any) =>
      old ? {
        ...old,
        sharedAlbums: old.sharedAlbums.map((c: SharedAlbumActivity) =>
          c.collectionId === item.collectionId ? { ...c, newMomentCount: 0 } : c
        ),
      } : old
    );
    router.push({ pathname: "/album/[id]" as any, params: { id: item.collectionId } });
  }, [user, router, queryClient]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.colors.textTertiary }]}>
            {sharedAlbums.length} {sharedAlbums.length === 1 ? "album" : "albums"}
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>shared albums</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={sharedAlbums}
          keyExtractor={(item) => item.collectionId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isMember = item.role === "member";
            const coverThumbUrl = item.coverPhotoUrl
              ? getPublicPhotoThumbnailUrl(item.coverPhotoUrl, 72, true)
              : null;
            return (
              <TouchableOpacity style={styles.row} onPress={() => handleTap(item)} activeOpacity={0.7}>
                {coverThumbUrl ? (
                  <Image source={{ uri: coverThumbUrl }} style={styles.coverThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.icon, { backgroundColor: theme.colors.chipBg }]}>
                    <Ionicons
                      name={isMember ? "people-outline" : "folder-outline"}
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
                    {isMember && item.ownerName ? `by ${item.ownerName} · ` : !isMember ? "your album · " : ""}
                    {pluralMoments(item.totalMoments)}
                  </Text>
                </View>
                {item.newMomentCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
                    <Text style={styles.badgeText}>{item.newMomentCount} new</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>No shared albums yet</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      gap: 8,
    },
    backBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: theme.colors.cardBg,
      alignItems: "center", justifyContent: "center",
    },
    eyebrow: {
      fontSize: 10, fontFamily: theme.fonts.bodyBold, letterSpacing: 0.8, textTransform: "uppercase",
    },
    title: { fontSize: 24, fontFamily: theme.fonts.display },
    list: { paddingHorizontal: 20, paddingBottom: 24 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    icon: {
      width: 36, height: 36, borderRadius: 8,
      alignItems: "center", justifyContent: "center",
    },
    coverThumb: {
      width: 36, height: 36, borderRadius: 8,
    },
    info: { flex: 1, marginLeft: 12 },
    name: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodyMedium },
    sub: { fontSize: theme.fontSize.xs, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { color: "#fff", fontSize: theme.fontSize.xs, fontFamily: theme.fonts.bodyBold },
    separator: { height: 0 },
    empty: { textAlign: "center", marginTop: 60, fontSize: theme.fontSize.base },
  });
}
