import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { fetchBrowseMetadata, fetchArtistMoments } from "@/lib/browse";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { pad } from "@/lib/dateUtils";
import { Moment } from "@/types";
import {
  BROWSE_META_STALE,
  REFLECTIONS_STALE,
  REFLECTIONS_RANDOM_STALE,
} from "@/lib/queryConfig";

// Focus-refetch cooldown for this screen, kept in step with the query itself.
const STALE_TIME = REFLECTIONS_STALE;

type ReflectionsData = {
  onThisDay: Moment[];
  recentWithPeople: Moment[];
  recentWithMood: Moment[];
};

type HeroType = "onThisDay" | "random";

async function fetchReflectionsData(
  userId: string,
  month: string,
  day: string,
  thisYear: number
): Promise<ReflectionsData> {
  const matchingDates: string[] = [];
  for (let y = thisYear - 1; y >= Math.max(thisYear - 30, 2000); y--) {
    matchingDates.push(`${y}-${month}-${day}`);
  }

  const [onThisDayResult, withPeopleResult, withMoodResult] =
    await Promise.all([
      supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS)
        .eq("user_id", userId)
        .in("moment_date", matchingDates)
        .order("moment_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS + ", people")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
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
    return { month, day, thisYear, todayLabel };
  }, []);

  const { month, day, thisYear, todayLabel } = dateParams;

  // Day-of-year seed for deterministic spotlight selection
  const dayOfYear = useMemo(() => {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  }, []);

  // Main data: deterministic sections
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    errorUpdatedAt,
  } = useQuery({
    queryKey: ["reflections", user?.id],
    queryFn: () => fetchReflectionsData(user!.id, month, day, thisYear),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  // Random moment: staleTime Infinity — sticky between tab navigations, only changes on shuffle
  const {
    data: randomMoment,
    refetch: refetchRandom,
    isFetching: shuffling,
  } = useQuery({
    queryKey: ["reflections-random", user?.id],
    queryFn: fetchRandomMoment,
    staleTime: REFLECTIONS_RANDOM_STALE,
    enabled: !!user,
  });

  // Browse metadata — shared cache with Browse tab; used to find spotlight artist across full library
  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
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
  const recentWithPeople = data?.recentWithPeople ?? [];
  const recentWithMood = data?.recentWithMood ?? [];

  const personSpotlight = useMemo(() => {
    const withPeople = recentWithPeople.filter((m) => m.people && m.people.length > 0);
    const people = [...new Set(withPeople.flatMap((m) => m.people))];
    if (!people.length) return null;
    const person = people[dayOfYear % people.length];
    const moments = withPeople.filter((m) => m.people?.includes(person)).slice(0, 2);
    return { person, moments };
  }, [recentWithPeople, dayOfYear]);

  const moodSpotlight = useMemo(() => {
    const moods = [...new Set(recentWithMood.flatMap((m) => m.moods))];
    if (!moods.length) return null;
    const mood = moods[dayOfYear % moods.length];
    const moodObj = allMoods.find((m) => m.value === mood);
    const moments = recentWithMood.filter((m) => m.moods.includes(mood)).slice(0, 2);
    return { mood, label: moodObj ? `${moodObj.emoji} ${moodObj.label}` : mood, moments };
  }, [recentWithMood, dayOfYear, allMoods]);

  // Derive spotlight artist from full library via browse meta cache
  const spotlightArtist = useMemo(() => {
    if (!meta.length) return null;
    const counts = new Map<string, number>();
    for (const m of meta) {
      if (!m.songArtist) continue;
      counts.set(m.songArtist, (counts.get(m.songArtist) ?? 0) + 1);
    }
    const eligible = [...counts.entries()].filter(([, cnt]) => cnt >= 2);
    if (!eligible.length) return null;
    return eligible[dayOfYear % eligible.length][0];
  }, [meta, dayOfYear]);

  // Fetch 2 moments for the selected artist — small targeted query, only fires once artist is known
  const { data: spotlightMoments = [] } = useQuery({
    queryKey: ["artistSpotlightMoments", user?.id, spotlightArtist],
    queryFn: () => fetchArtistMoments(user!.id, spotlightArtist!),
    enabled: !!user && !!spotlightArtist,
    staleTime: STALE_TIME,
    select: (moments) => moments.slice(0, 2),
  });

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

  // Hero: On This Day if available, else Random
  const heroType: HeroType = useMemo(() => {
    if (byYear.length > 0) return "onThisDay";
    return "random";
  }, [byYear]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  if (isError && !data) {
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
  if (randomMoment === null && onThisDay.length === 0) {
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
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={theme.colors.textSecondary}
          />
        }
      >
        {showBanner ? (
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        ) : null}

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

        {heroType === "random" && randomMoment && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.heroTitle}>A Random Memory</Text>
              <TouchableOpacity onPress={handleShuffle} disabled={shuffling} hitSlop={8}>
                {shuffling ? (
                  <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                ) : (
                  <Ionicons name="shuffle" size={20} color={theme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
            <MomentCard item={randomMoment} allMoods={allMoods} />
          </>
        )}

        {/* ── SPOTLIGHTS ── */}

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

        {spotlightArtist && spotlightMoments.length > 0 && (
          <>
            <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
              <Text style={styles.sectionTitle}>More from {spotlightArtist}</Text>
            </View>
            {spotlightMoments.map((m) => (
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
                  <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                ) : (
                  <Ionicons name="shuffle" size={20} color={theme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
            <MomentCard item={randomMoment} allMoods={allMoods} />
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
