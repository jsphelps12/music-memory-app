import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ALL_PROMPTS } from "@/constants/Prompts";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { friendlyError } from "@/lib/errors";
import { pad } from "@/lib/dateUtils";
import { Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

type HeroType = "onThisDay" | "aMonthAgo" | "random";

export default function ReflectionsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [onThisDay, setOnThisDay] = useState<Moment[]>([]);
  const [randomMoment, setRandomMoment] = useState<Moment | null>(null);
  const [aMonthAgo, setAMonthAgo] = useState<Moment | null>(null);
  const [aYearAgo, setAYearAgo] = useState<Moment | null>(null);
  const [forgottenMoment, setForgottenMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState("");

  const lastFetchTime = useRef(0);
  // Preserve the random moment when returning to tab — only re-pick on explicit shuffle
  const randomMomentRef = useRef<Moment | null>(null);

  // Clear all data immediately when the user changes
  useEffect(() => {
    setOnThisDay([]);
    setRandomMoment(null);
    setAMonthAgo(null);
    setAYearAgo(null);
    setForgottenMoment(null);
    randomMomentRef.current = null;
    lastFetchTime.current = 0;
    initialFetchDoneRef.current = false;
  }, [user?.id]);

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

  // "A Month Ago" window: 25–35 days back
  const aMonthAgoFrom = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 35);
    return d.toISOString().slice(0, 10);
  })();
  const aMonthAgoTo = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 25);
    return d.toISOString().slice(0, 10);
  })();

  // "A Year Ago" window: 350–380 days back
  const aYearAgoFrom = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 380);
    return d.toISOString().slice(0, 10);
  })();
  const aYearAgoTo = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 350);
    return d.toISOString().slice(0, 10);
  })();

  // Daily rotating prompt — deterministic per calendar day
  const dailyPrompt = useMemo(() => {
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
    return ALL_PROMPTS[dayOfYear % ALL_PROMPTS.length];
  }, []);

  const fetchOnThisDay = useCallback(async (): Promise<Moment[]> => {
    if (!user) return [];
    const matchingDates: string[] = [];
    for (let y = thisYear - 1; y >= Math.max(thisYear - 30, 2000); y--) {
      matchingDates.push(`${y}-${month}-${day}`);
    }
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .in("moment_date", matchingDates)
      .order("moment_date", { ascending: false })
      .order("created_at", { ascending: false });
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

  const fetchAMonthAgo = useCallback(async (): Promise<Moment | null> => {
    if (!user) return null;
    const { data } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .gte("moment_date", aMonthAgoFrom)
      .lte("moment_date", aMonthAgoTo)
      .order("moment_date", { ascending: false })
      .limit(1);
    return data?.[0] ? mapRowToMoment(data[0]) : null;
  }, [user, aMonthAgoFrom, aMonthAgoTo]);

  const fetchAYearAgo = useCallback(async (): Promise<Moment | null> => {
    if (!user) return null;
    const { data } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .gte("moment_date", aYearAgoFrom)
      .lte("moment_date", aYearAgoTo)
      .order("moment_date", { ascending: false })
      .limit(1);
    return data?.[0] ? mapRowToMoment(data[0]) : null;
  }, [user, aYearAgoFrom, aYearAgoTo]);

  const fetchForgotten = useCallback(async (): Promise<Moment | null> => {
    if (!user) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const cutoffStr = cutoff.toISOString();
    const { count } = await supabase
      .from("moments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lt("created_at", cutoffStr);
    if (!count || count === 0) return null;
    const offset = Math.floor(Math.random() * count);
    const { data } = await supabase
      .from("moments")
      .select("*")
      .eq("user_id", user.id)
      .lt("created_at", cutoffStr)
      .order("created_at", { ascending: false })
      .range(offset, offset);
    return data?.[0] ? mapRowToMoment(data[0]) : null;
  }, [user]);

  const loadAll = useCallback(
    async (preserveRandom: boolean, silent = false) => {
      if (!user) return;
      if (!silent) { setLoading(true); setError(""); }
      try {
        const [otd, rand, ama, aya, forgotten] = await Promise.all([
          fetchOnThisDay(),
          preserveRandom && randomMomentRef.current
            ? Promise.resolve(randomMomentRef.current)
            : fetchRandom(),
          fetchAMonthAgo(),
          fetchAYearAgo(),
          fetchForgotten(),
        ]);
        setOnThisDay(otd);
        setRandomMoment(rand);
        randomMomentRef.current = rand;
        setAMonthAgo(ama);
        setAYearAgo(aya);
        setForgottenMoment(forgotten);
      } catch (e: any) {
        if (!silent) setError(friendlyError(e));
      } finally {
        if (!silent) setLoading(false);
        lastFetchTime.current = Date.now();
      }
    },
    [user, fetchOnThisDay, fetchRandom, fetchAMonthAgo, fetchAYearAgo, fetchForgotten]
  );

  // Initial fetch — starts on mount so data is ready when navigated to
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    loadAll(false);
  }, [loadAll]);

  // Silent background refresh when returning to tab after cooldown
  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current > 0 && elapsed >= REFETCH_COOLDOWN_MS) {
        loadAll(true, true);
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

  // Hero fallback: On This Day → A Month Ago → Random
  const heroType: HeroType = useMemo(() => {
    if (byYear.length > 0) return "onThisDay";
    if (aMonthAgo) return "aMonthAgo";
    return "random";
  }, [byYear, aMonthAgo]);

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

  // Empty state: user has no moments at all
  if (randomMoment === null) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Reflections</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Your memories resurface here.</Text>
          <Text style={styles.emptyBody}>
            On This Day, a month ago, a random moment — the songs that marked
            your life, brought back to you.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push("/create")}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyButtonText}>Capture your first memory</Text>
          </TouchableOpacity>
        </View>
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
        {/* ── HERO ── */}
        {heroType === "onThisDay" && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.heroTitle}>On This Day</Text>
              <Text style={styles.sectionSubtitle}>{todayLabel}</Text>
            </View>
            {byYear.map(({ year, moments }) => {
              const yearsAgo = thisYear - year;
              const label = yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`;
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
            })}
          </>
        )}

        {heroType === "aMonthAgo" && aMonthAgo && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.heroTitle}>A Month Ago</Text>
              {aMonthAgo.momentDate && (
                <Text style={styles.sectionSubtitle}>
                  {new Date(aMonthAgo.momentDate + "T00:00:00").toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              )}
            </View>
            <MomentCard
              item={aMonthAgo}
              onPress={() => router.push(`/moment/${aMonthAgo.id}`)}
              allMoods={allMoods}
            />
          </>
        )}

        {heroType === "random" && randomMoment && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.heroTitle}>A Random Memory</Text>
              <TouchableOpacity onPress={handleShuffle} disabled={shuffling} hitSlop={8}>
                {shuffling ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="shuffle" size={20} color={theme.colors.accent} />
                )}
              </TouchableOpacity>
            </View>
            <MomentCard
              item={randomMoment}
              onPress={() => router.push(`/moment/${randomMoment.id}`)}
              allMoods={allMoods}
            />
          </>
        )}

        {/* ── SUPPORTING ── */}

        {/* A Month Ago — supporting (only when not hero) */}
        {heroType !== "aMonthAgo" && aMonthAgo && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>A Month Ago</Text>
              {aMonthAgo.momentDate && (
                <Text style={styles.sectionSubtitle}>
                  {new Date(aMonthAgo.momentDate + "T00:00:00").toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              )}
            </View>
            <MomentCard
              item={aMonthAgo}
              onPress={() => router.push(`/moment/${aMonthAgo.id}`)}
              allMoods={allMoods}
            />
          </>
        )}

        {/* A Year Ago — hidden when empty */}
        {aYearAgo && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>A Year Ago</Text>
              {aYearAgo.momentDate && (
                <Text style={styles.sectionSubtitle}>
                  {new Date(aYearAgo.momentDate + "T00:00:00").toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              )}
            </View>
            <MomentCard
              item={aYearAgo}
              onPress={() => router.push(`/moment/${aYearAgo.id}`)}
              allMoods={allMoods}
            />
          </>
        )}

        {/* Journal Prompt — always visible */}
        <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
          <Text style={styles.sectionTitle}>Journal Prompt</Text>
        </View>
        <View style={styles.promptCard}>
          <Text style={styles.promptQuestion}>{dailyPrompt.question}</Text>
          <TouchableOpacity
            style={styles.promptCta}
            onPress={() =>
              router.push({
                pathname: "/create",
                params: {
                  promptQuestion: dailyPrompt.question,
                  promptStarter: dailyPrompt.starter,
                },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.promptCtaText}>Capture this memory →</Text>
          </TouchableOpacity>
        </View>

        {/* A Random Memory — supporting (only when not hero) */}
        {heroType !== "random" && randomMoment && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>A Random Memory</Text>
              <TouchableOpacity onPress={handleShuffle} disabled={shuffling} hitSlop={8}>
                {shuffling ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="shuffle" size={20} color={theme.colors.accent} />
                )}
              </TouchableOpacity>
            </View>
            <MomentCard
              item={randomMoment}
              onPress={() => router.push(`/moment/${randomMoment.id}`)}
              allMoods={allMoods}
            />
          </>
        )}

        {/* Forgotten Moment — hidden when empty */}
        {forgottenMoment && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>Forgotten Moment</Text>
            </View>
            <MomentCard
              item={forgottenMoment}
              onPress={() => router.push(`/moment/${forgottenMoment.id}`)}
              allMoods={allMoods}
            />
          </>
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
    heroTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
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
    promptCard: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    promptQuestion: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      lineHeight: 22,
    },
    promptCta: {
      alignSelf: "flex-start",
    },
    promptCtaText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.semibold,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    emptyBody: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: theme.spacing["2xl"],
    },
    emptyButton: {
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radii.button,
      backgroundColor: theme.colors.accent,
    },
    emptyButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
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
