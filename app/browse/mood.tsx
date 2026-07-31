import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { setCachedMoment } from "@/lib/momentCache";
import { fetchBrowseMetadata, fetchMoodMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { DistributionBar } from "@/components/DistributionBar";
import type { Moment } from "@/types";

export default function MoodScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { value: initialValue } = useLocalSearchParams<{ value: string }>();
  const [activeMood, setActiveMood] = useState(initialValue ?? "");
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const { data: moments = [], isLoading } = useQuery({
    queryKey: ["moodMoments", user?.id, activeMood] as const,
    queryFn: ({ queryKey }) => fetchMoodMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activeMood,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  // All moods the user has actually used
  const usedMoods = useMemo(() => {
    const set = new Set<string>();
    for (const m of meta) for (const mood of m.moods) set.add(mood);
    return MOODS.filter((m) => set.has(m.value));
  }, [meta]);

  const currentMood = MOODS.find((m) => m.value === activeMood);
  const tint = theme.colors.accent;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{moments.length} moments</Text>
          <Text style={styles.title}>
            {currentMood ? `${currentMood.emoji}  ${currentMood.label.toLowerCase()}` : activeMood}
          </Text>
        </View>
      </View>

      {/* Mood switcher */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        data={usedMoods}
        keyExtractor={(m) => m.value}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 6, alignItems: "center" }}
        renderItem={({ item }) => {
          const isActive = item.value === activeMood;
          return (
            <TouchableOpacity
              onPress={() => setActiveMood(item.value)}
              style={[
                styles.chip,
                isActive && { backgroundColor: theme.colors.buttonBg, borderColor: theme.colors.buttonBg },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isActive && { color: theme.colors.buttonText }]}>
                {item.emoji} {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Distribution bar */}
      {!isLoading && moments.length > 0 && (
        <DistributionBar moments={moments} color={tint} />
      )}

      {/* Moment list */}
      <FlatList
        key={activeMood}
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
              <AppImage
                source={{ uri: item.songArtworkUrl }}
                style={styles.artwork}
                contentFit="cover"
              />
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
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      gap: 8,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.colors.cardBg,
      alignItems: "center",
      justifyContent: "center",
    },
    eyebrow: {
      fontSize: 10,
      fontFamily: "DMSans_700Bold",
      letterSpacing: 1,
      color: theme.colors.textTertiary,
    },
    title: {
      fontSize: 24,
      fontFamily: "DMSerifDisplay_400Regular",
      color: theme.colors.text,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radii.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.text,
    },
    momentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 10,
    },
    artwork: {
      width: 44,
      height: 44,
      borderRadius: 6,
    },
    songTitle: {
      fontSize: 14,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    reflection: {
      fontSize: 12,
      color: theme.colors.textTertiary,
      fontStyle: "italic",
      marginTop: 3,
    },
    date: {
      fontSize: 11,
      color: theme.colors.textTertiary,
      flexShrink: 0,
    },
  });
}
