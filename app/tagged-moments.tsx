import { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { fetchSharedScreenData } from "@/lib/sharedScreen";
import type { TaggedMoment } from "@/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function TaggedMomentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data, isLoading } = useQuery({
    queryKey: ["sharedScreen", user?.id],
    queryFn: () => fetchSharedScreenData(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const taggedMoments = data?.taggedMoments ?? [];

  const handleTap = useCallback((tag: TaggedMoment) => {
    router.push({
      pathname: "/moment/[id]" as any,
      params: { id: tag.momentId, contributorName: tag.taggerDisplayName ?? undefined },
    });
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.colors.textTertiary }]}>
            {taggedMoments.length} {taggedMoments.length === 1 ? "moment" : "moments"}
          </Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>tagged in</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          data={taggedMoments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const artwork = item.moment?.songArtworkUrl;
            return (
              <TouchableOpacity style={styles.row} onPress={() => handleTap(item)} activeOpacity={0.7}>
                {artwork ? (
                  <Image source={{ uri: artwork }} style={styles.artwork} contentFit="cover" />
                ) : (
                  <ArtworkPlaceholder style={styles.artwork} />
                )}
                <View style={styles.info}>
                  <Text style={[styles.song, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.moment?.songTitle ?? "Unknown song"}
                  </Text>
                  <Text style={[styles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {item.moment?.songArtist ?? ""}
                  </Text>
                  <Text style={[styles.by, { color: theme.colors.textTertiary }]} numberOfLines={1}>
                    {item.taggerDisplayName ?? "Someone"} tagged you
                  </Text>
                </View>
                <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
                  {timeAgo(item.createdAt)}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>No tagged moments yet</Text>
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
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    artwork: { width: 46, height: 46, borderRadius: 6 },
    info: { flex: 1, marginLeft: 12 },
    song: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    artist: { fontSize: theme.fontSize.sm, marginTop: 1 },
    by: { fontSize: theme.fontSize.xs, marginTop: 3 },
    date: { fontSize: theme.fontSize.xs, marginLeft: 8 },
    empty: { textAlign: "center", marginTop: 60, fontSize: theme.fontSize.base },
  });
}
