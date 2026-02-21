import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { friendlyError } from "@/lib/errors";
import { Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 2000;

const pad = (n: number) => String(n).padStart(2, "0");

export default function ReflectionsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [onThisDay, setOnThisDay] = useState<Moment[]>([]);
  const [randomMoment, setRandomMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState("");

  const lastFetchTime = useRef(0);
  // Preserve the random moment when returning to tab — only re-pick on explicit shuffle
  const randomMomentRef = useRef<Moment | null>(null);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const now = new Date();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const thisYear = now.getFullYear();
  const todayLabel = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  const fetchOnThisDay = useCallback(async (): Promise<Moment[]> => {
    if (!user) return [];
    // moment_date is a date column — build explicit year-date strings instead of LIKE
    const matchingDates: string[] = [];
    for (let y = thisYear - 1; y >= Math.max(thisYear - 30, 2000); y--) {
      matchingDates.push(`${y}-${month}-${day}`);
    }
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .in("moment_date", matchingDates)
      .order("moment_date", { ascending: false });
    if (fetchError) throw fetchError;
    return (data ?? []).map(mapRowToMoment);
  }, [user, month, day, thisYear]);

  const fetchRandom = useCallback(async (): Promise<Moment | null> => {
    if (!user) return null;
    const { count } = await supabase
      .from("moments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!count || count === 0) return null;
    const offset = Math.floor(Math.random() * count);
    const { data } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset);
    return data?.[0] ? mapRowToMoment(data[0]) : null;
  }, [user]);

  const loadAll = useCallback(
    async (preserveRandom: boolean) => {
      if (!user) return;
      setLoading(true);
      setError("");
      try {
        const [otd, rand] = await Promise.all([
          fetchOnThisDay(),
          preserveRandom && randomMomentRef.current
            ? Promise.resolve(randomMomentRef.current)
            : fetchRandom(),
        ]);
        setOnThisDay(otd);
        setRandomMoment(rand);
        randomMomentRef.current = rand;
      } catch (e: any) {
        setError(friendlyError(e));
      } finally {
        setLoading(false);
        lastFetchTime.current = Date.now();
      }
    },
    [user, fetchOnThisDay, fetchRandom]
  );

  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        loadAll(false);
      } else if (elapsed >= REFETCH_COOLDOWN_MS) {
        loadAll(true);
      }
    }, [loadAll])
  );

  const handleShuffle = useCallback(async () => {
    setShuffling(true);
    try {
      const rand = await fetchRandom();
      setRandomMoment(rand);
      randomMomentRef.current = rand;
    } catch {}
    setShuffling(false);
  }, [fetchRandom]);

  // Group On This Day moments by year, newest first
  const byYear = useMemo(() => {
    const map = new Map<number, Moment[]>();
    for (const m of onThisDay) {
      const y = new Date(m.momentDate! + "T00:00:00").getFullYear();
      const arr = map.get(y) ?? [];
      arr.push(m);
      map.set(y, arr);
    }
    return Array.from(map.keys())
      .sort((a, b) => b - a)
      .map((year) => ({ year, moments: map.get(year)! }));
  }, [onThisDay]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => loadAll(false)}
          activeOpacity={0.7}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reflections</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* On This Day */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>On This Day</Text>
          <Text style={styles.sectionSubtitle}>{todayLabel}</Text>
        </View>

        {byYear.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>
              No moments from this date in past years yet.
            </Text>
          </View>
        ) : (
          byYear.map(({ year, moments }) => {
            const yearsAgo = thisYear - year;
            const label =
              yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`;
            return (
              <View key={year} style={styles.yearGroup}>
                <Text style={styles.yearLabel}>
                  {label} · {year}
                </Text>
                {moments.map((m) => (
                  <MomentCard
                    key={m.id}
                    item={m}
                    onPress={() => router.push(`/moment/${m.id}`)}
                    allMoods={allMoods}
                  />
                ))}
              </View>
            );
          })
        )}

        {/* A Random Memory */}
        <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
          <Text style={styles.sectionTitle}>A Random Memory</Text>
          <TouchableOpacity
            onPress={handleShuffle}
            disabled={shuffling}
            hitSlop={8}
          >
            {shuffling ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons name="shuffle" size={20} color={theme.colors.accent} />
            )}
          </TouchableOpacity>
        </View>

        {randomMoment ? (
          <MomentCard
            item={randomMoment}
            onPress={() => router.push(`/moment/${randomMoment.id}`)}
            allMoods={allMoods}
          />
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No moments yet.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    header: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 80,
      paddingBottom: theme.spacing.lg,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["4xl"],
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    sectionRowSpaced: {
      marginTop: theme.spacing["3xl"],
    },
    sectionTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    sectionSubtitle: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    yearGroup: {
      marginBottom: theme.spacing.xl,
    },
    yearLabel: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    emptySection: {
      paddingVertical: theme.spacing.xl,
      alignItems: "center",
    },
    emptyText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textTertiary,
      textAlign: "center",
    },
    errorText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
    },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
    },
    retryText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
  });
}
