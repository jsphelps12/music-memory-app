import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { setCachedMoment } from "@/lib/momentCache";
import { fetchBrowseMetadata, fetchMoodMoments } from "@/lib/browse";
import type { Moment } from "@/types";

const MOOD_TINTS: Record<string, string> = {
  nostalgic: "#d4a574",
  joyful: "#E8A55C",
  melancholy: "#5a7a8c",
  energetic: "#c4707a",
  peaceful: "#7a8c5a",
  romantic: "#c4707a",
  rebellious: "#c4707a",
  hopeful: "#E8825C",
  bittersweet: "#9b6b4a",
  empowered: "#7a5a8c",
};

function DistributionBar({ moments, color }: { moments: Moment[]; color: string }) {
  const theme = useTheme();
  const counts = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const m of moments) {
      if (!m.momentDate) continue;
      const key = m.momentDate.slice(0, 7); // YYYY-MM
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length === 0) return [];
    const max = Math.max(...sorted.map(([, c]) => c));
    return sorted.map(([, c]) => c / max);
  }, [moments]);

  if (counts.length === 0) return null;

  const dateRange = useMemo(() => {
    const dates = moments.map((m) => m.momentDate).filter(Boolean) as string[];
    if (dates.length === 0) return "";
    const sorted = [...dates].sort();
    const from = new Date(sorted[0] + "T00:00:00").getFullYear();
    const to = new Date(sorted[sorted.length - 1] + "T00:00:00").getFullYear();
    return from === to ? `${from}` : `${from} → today`;
  }, [moments]);

  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
      <View style={{
        backgroundColor: theme.colors.cardBg,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        padding: 14,
      }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, color: theme.colors.textTertiary }}>
            WHEN
          </Text>
          <Text style={{ fontSize: 11, color: theme.colors.textTertiary }}>{dateRange}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end", height: 28 }}>
          {counts.map((ratio, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: Math.max(3, ratio * 28),
                backgroundColor: ratio > 0 ? color : theme.colors.border,
                borderRadius: 2,
                opacity: ratio > 0 ? 0.85 : 1,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

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
    staleTime: 60_000,
  });

  const { data: moments = [], isLoading } = useQuery({
    queryKey: ["moodMoments", user?.id, activeMood] as const,
    queryFn: ({ queryKey }) => fetchMoodMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activeMood,
    staleTime: 60_000,
  });

  // All moods the user has actually used
  const usedMoods = useMemo(() => {
    const set = new Set<string>();
    for (const m of meta) if (m.mood) set.add(m.mood);
    return MOODS.filter((m) => set.has(m.value));
  }, [meta]);

  const currentMood = MOODS.find((m) => m.value === activeMood);
  const tint = MOOD_TINTS[activeMood] ?? theme.colors.accent;

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
              <Image
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
          isLoading ? null : (
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
