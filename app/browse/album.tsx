import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { setCachedMoment } from "@/lib/momentCache";
import { fetchBrowseMetadata, fetchAlbumMoments } from "@/lib/browse";
import { DistributionBar } from "@/components/DistributionBar";

export default function AlbumScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { album: initialAlbum, artist: initialArtist } = useLocalSearchParams<{ album: string; artist: string }>();
  const [activeKey, setActiveKey] = useState(`${initialAlbum ?? ""}|||${initialArtist ?? ""}`);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const allAlbums = useMemo(() => {
    const seen = new Map<string, { albumName: string; artist: string; artworkUrl: string; count: number }>();
    for (const m of meta) {
      if (!m.songAlbumName) continue;
      const key = `${m.songAlbumName}|||${m.songArtist}`;
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { albumName: m.songAlbumName, artist: m.songArtist, artworkUrl: m.songArtworkUrl, count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count);
  }, [meta]);

  const activeAlbum = allAlbums.find((a) => `${a.albumName}|||${a.artist}` === activeKey);

  const { data: moments = [], isLoading } = useQuery({
    queryKey: ["albumMoments", user?.id, activeAlbum?.albumName, activeAlbum?.artist] as const,
    queryFn: ({ queryKey }) => fetchAlbumMoments(queryKey[1]!, queryKey[2]!, queryKey[3]!),
    enabled: !!user && !!activeAlbum,
    staleTime: 60_000,
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{moments.length} moments</Text>
          <Text style={styles.title} numberOfLines={1}>{activeAlbum?.albumName ?? ""}</Text>
          {activeAlbum?.artist ? (
            <Text style={styles.subtitle} numberOfLines={1}>{activeAlbum.artist}</Text>
          ) : null}
        </View>
      </View>

      {/* Album switcher */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        data={allAlbums}
        keyExtractor={(a) => `${a.albumName}|||${a.artist}`}
        contentContainerStyle={{ paddingLeft: 16, paddingRight: 24, paddingBottom: 12, gap: 6, alignItems: "center" }}
        renderItem={({ item }) => {
          const key = `${item.albumName}|||${item.artist}`;
          const isActive = key === activeKey;
          return (
            <TouchableOpacity
              onPress={() => setActiveKey(key)}
              style={[styles.chip, isActive && { backgroundColor: theme.colors.buttonBg, borderColor: theme.colors.buttonBg }]}
              activeOpacity={0.7}
            >
              {item.artworkUrl ? (
                <Image source={{ uri: item.artworkUrl }} style={styles.chipArt} contentFit="cover" />
              ) : null}
              <Text style={[styles.chipText, isActive && { color: theme.colors.buttonText }]} numberOfLines={1}>
                {item.albumName}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {!isLoading && moments.length > 0 && (
        <DistributionBar moments={moments} color={theme.colors.accent} />
      )}

      <FlatList
        key={activeKey}
        data={moments}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.momentRow}
            onPress={() => {
              setCachedMoment(item);
              router.push({ pathname: "/moment/[id]", params: { id: item.id } });
            }}
            activeOpacity={0.8}
          >
            {item.songArtworkUrl ? (
              <Image source={{ uri: item.songArtworkUrl }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, { backgroundColor: theme.colors.backgroundSecondary }]} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.songTitle} numberOfLines={1}>{item.songTitle}</Text>
              <Text style={styles.songArtist} numberOfLines={1}>{item.songArtist}</Text>
              {item.reflectionText ? (
                <Text style={styles.reflection} numberOfLines={1}>{item.reflectionText}</Text>
              ) : null}
            </View>
            {item.momentDate ? (
              <Text style={styles.date}>
                {new Date(item.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <ActivityIndicator color={theme.colors.textSecondary} />
            </View>
          ) : (
            <Text style={{ color: theme.colors.textTertiary, textAlign: "center", marginTop: 40 }}>
              No moments yet
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
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
    eyebrow: { fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1, color: theme.colors.textTertiary },
    title: { fontSize: 24, fontFamily: "DMSerifDisplay_400Regular", color: theme.colors.text },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 1 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 10, paddingVertical: 8, minHeight: 34,
      borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.border,
    },
    chipArt: { width: 20, height: 20, borderRadius: 3 },
    chipText: { fontSize: 13, fontFamily: "DMSans_500Medium", color: theme.colors.text, maxWidth: 120 },
    momentRow: {
      flexDirection: "row", alignItems: "center", gap: 11,
      backgroundColor: theme.colors.cardBg, borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 10,
    },
    artwork: { width: 44, height: 44, borderRadius: 6 },
    songTitle: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: theme.colors.text },
    songArtist: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
    reflection: { fontSize: 12, color: theme.colors.textTertiary, fontStyle: "italic", marginTop: 3 },
    date: { fontSize: 11, color: theme.colors.textTertiary, flexShrink: 0 },
  });
}
