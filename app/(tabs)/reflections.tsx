import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { pad } from "@/lib/dateUtils";
import { Moment } from "@/types";

const STALE_TIME = 5 * 60 * 1000;

type ReflectionsData = {
  onThisDay: Moment[];
  aMonthAgo: Moment | null;
  aYearAgo: Moment | null;
  forgottenMoment: Moment | null;
  thisWeekLastYear: Moment[];
  recentWithPeople: Moment[];
  recentWithMood: Moment[];
};

type HeroType = "onThisDay" | "aMonthAgo" | "random";

async function fetchReflectionsData(
  userId: string,
  month: string,
  day: string,
  thisYear: number,
  aMonthAgoFrom: string,
  aMonthAgoTo: string,
  aYearAgoFrom: string,
  aYearAgoTo: string,
  weekLastYearFrom: string,
  weekLastYearTo: string
): Promise<ReflectionsData> {
  const matchingDates: string[] = [];
  for (let y = thisYear - 1; y >= Math.max(thisYear - 30, 2000); y--) {
    matchingDates.push(`${y}-${month}-${day}`);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  const [
    onThisDayResult,
    aMonthAgoResult,
    aYearAgoResult,
    forgottenResult,
    weekLastYearResult,
    withPeopleResult,
    withMoodResult,
  ] = await Promise.all([
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .in("moment_date", matchingDates)
      .order("moment_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .gte("moment_date", aMonthAgoFrom)
      .lte("moment_date", aMonthAgoTo)
      .order("moment_date", { ascending: false })
      .limit(1),
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .gte("moment_date", aYearAgoFrom)
      .lte("moment_date", aYearAgoTo)
      .order("moment_date", { ascending: false })
      .limit(1),
    supabase.rpc("get_random_forgotten_moment", { p_cutoff: cutoff.toISOString() }),
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .gte("moment_date", weekLastYearFrom)
      .lte("moment_date", weekLastYearTo)
      .order("moment_date", { ascending: false })
      .limit(3),
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .not("people", "eq", "{}")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("moments")
      .select(MOMENT_CARD_COLUMNS)
      .eq("user_id", userId)
      .not("mood", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return {
    onThisDay: (onThisDayResult.data ?? []).map(mapRowToMoment),
    aMonthAgo: aMonthAgoResult.data?.[0] ? mapRowToMoment(aMonthAgoResult.data[0]) : null,
    aYearAgo: aYearAgoResult.data?.[0] ? mapRowToMoment(aYearAgoResult.data[0]) : null,
    forgottenMoment:
      !forgottenResult.error && forgottenResult.data?.length > 0
        ? mapRowToMoment(forgottenResult.data[0])
        : null,
    thisWeekLastYear: (weekLastYearResult.data ?? []).map(mapRowToMoment),
    recentWithPeople: (withPeopleResult.data ?? []).map(mapRowToMoment),
    recentWithMood: (withMoodResult.data ?? []).map(mapRowToMoment),
  };
}

async function fetchRandomMoment(): Promise<Moment | null> {
  const { data, error } = await supabase.rpc("get_random_moment");
  if (error || !data || data.length === 0) return null;
  return mapRowToMoment(data[0]);
}

export default function ReflectionsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  // Stable date params — computed once on mount
  const dateParams = useMemo(() => {
    const now = new Date();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const thisYear = now.getFullYear();
    const todayLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

    const offset = (days: number) => {
      const d = new Date(now); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10);
    };

    return {
      month, day, thisYear, todayLabel,
      aMonthAgoFrom: offset(35),
      aMonthAgoTo: offset(25),
      aYearAgoFrom: offset(380),
      aYearAgoTo: offset(350),
      weekLastYearFrom: offset(369),
      weekLastYearTo: offset(361),
    };
  }, []);

  const {
    month, day, thisYear, todayLabel,
    aMonthAgoFrom, aMonthAgoTo, aYearAgoFrom, aYearAgoTo,
    weekLastYearFrom, weekLastYearTo,
  } = dateParams;

  // Day-of-year seed for deterministic spotlight selection
  const dayOfYear = useMemo(() => {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  }, []);

  // Main data: deterministic sections
  const {
    data,
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["reflections", user?.id],
    queryFn: () =>
      fetchReflectionsData(user!.id, month, day, thisYear, aMonthAgoFrom, aMonthAgoTo, aYearAgoFrom, aYearAgoTo, weekLastYearFrom, weekLastYearTo),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // Random moment: staleTime Infinity — sticky between tab navigations, only changes on shuffle
  const {
    data: randomMoment,
    refetch: refetchRandom,
    isFetching: shuffling,
  } = useQuery({
    queryKey: ["reflections-random", user?.id],
    queryFn: fetchRandomMoment,
    staleTime: Infinity,
    enabled: !!user,
  });

  useFocusEffect(
    useCallback(() => {
      if (!dataUpdatedAt || Date.now() - dataUpdatedAt > STALE_TIME) {
        refetch();
      }
    }, [refetch, dataUpdatedAt])
  );

  const handleShuffle = useCallback(() => {
    refetchRandom();
  }, [refetchRandom]);

  const onThisDay = data?.onThisDay ?? [];
  const aMonthAgo = data?.aMonthAgo ?? null;
  const aYearAgo = data?.aYearAgo ?? null;
  const forgottenMoment = data?.forgottenMoment ?? null;
  const thisWeekLastYear = data?.thisWeekLastYear ?? [];
  const recentWithPeople = data?.recentWithPeople ?? [];
  const recentWithMood = data?.recentWithMood ?? [];

  const personSpotlight = useMemo(() => {
    const people = [...new Set(recentWithPeople.flatMap((m) => m.people ?? []))];
    if (!people.length) return null;
    const person = people[dayOfYear % people.length];
    const moments = recentWithPeople.filter((m) => m.people?.includes(person)).slice(0, 2);
    return { person, moments };
  }, [recentWithPeople, dayOfYear]);

  const moodSpotlight = useMemo(() => {
    const moods = [...new Set(recentWithMood.map((m) => m.mood).filter((x): x is string => Boolean(x)))];
    if (!moods.length) return null;
    const mood = moods[dayOfYear % moods.length];
    const moodObj = allMoods.find((m) => m.value === mood);
    const moments = recentWithMood.filter((m) => m.mood === mood).slice(0, 2);
    return { mood, label: moodObj ? `${moodObj.emoji} ${moodObj.label}` : mood, moments };
  }, [recentWithMood, dayOfYear, allMoods]);

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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Something went wrong loading your memories.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} activeOpacity={0.7}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Empty state: user has no moments at all
  if (randomMoment === null && onThisDay.length === 0 && !aMonthAgo) {
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
                    <MomentCard key={m.id} item={m} allMoods={allMoods} />
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
            <MomentCard item={aMonthAgo} allMoods={allMoods} />
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
            <MomentCard item={randomMoment} allMoods={allMoods} />
          </>
        )}

        {/* ── SUPPORTING ── */}

        {thisWeekLastYear.length > 0 && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>This Week Last Year</Text>
            </View>
            {thisWeekLastYear.map((m) => (
              <MomentCard key={m.id} item={m} allMoods={allMoods} />
            ))}
          </>
        )}

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
            <MomentCard item={aMonthAgo} allMoods={allMoods} />
          </>
        )}

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
            <MomentCard item={aYearAgo} allMoods={allMoods} />
          </>
        )}

        {personSpotlight && personSpotlight.moments.length > 0 && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>Memories with {personSpotlight.person}</Text>
            </View>
            {personSpotlight.moments.map((m) => (
              <MomentCard key={m.id} item={m} allMoods={allMoods} />
            ))}
          </>
        )}

        {moodSpotlight && moodSpotlight.moments.length > 0 && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>When you felt {moodSpotlight.label}</Text>
            </View>
            {moodSpotlight.moments.map((m) => (
              <MomentCard key={m.id} item={m} allMoods={allMoods} />
            ))}
          </>
        )}

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
            <MomentCard item={randomMoment} allMoods={allMoods} />
          </>
        )}

        {forgottenMoment && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>Forgotten Moment</Text>
            </View>
            <MomentCard item={forgottenMoment} allMoods={allMoods} />
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    title: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
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
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    sectionTitle: {
      fontSize: theme.fontSize.lg,
      fontFamily: theme.fonts.bodySemibold,
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
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.lg,
      fontFamily: theme.fonts.bodySemibold,
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
      fontFamily: theme.fonts.bodySemibold,
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
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
  });
}
