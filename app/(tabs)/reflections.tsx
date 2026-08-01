import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppImage } from "@/components/AppImage";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { fetchBrowseMetadata, BrowseMeta } from "@/lib/browse";
import { consumeReflectionsSearchRequest } from "@/lib/reflectionsSearch";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard } from "@/components/MomentCard";
import { MomentSearch } from "@/components/MomentSearch";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { pad } from "@/lib/dateUtils";
import { Moment } from "@/types";
import {
  BROWSE_META_STALE,
  REFLECTIONS_STALE,
  REFLECTIONS_RANDOM_STALE,
} from "@/lib/queryConfig";

// Reflections reorg (2026-08): the archive (old Browse tab) merged INTO this
// screen. Order is deliberate — resurfacing first, browsing second:
// search · On This Day · Weekly Rewind · Moods · People · Years · Albums ·
// Surprise Me. The rotating person/mood/artist spotlights are gone: the strips
// give the same doors deterministically, and "When you felt X" is absorbed by
// the Moods grid. Drill-down routes under app/browse/ are unchanged.

// Focus-refetch cooldown for this screen, kept in step with the query itself.
const STALE_TIME = REFLECTIONS_STALE;

async function fetchOnThisDay(
  userId: string,
  month: string,
  day: string,
  thisYear: number
): Promise<Moment[]> {
  const matchingDates: string[] = [];
  for (let y = thisYear - 1; y >= Math.max(thisYear - 30, 2000); y--) {
    matchingDates.push(`${y}-${month}-${day}`);
  }
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .in("moment_date", matchingDates)
    .order("moment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

async function fetchRandomMoment(): Promise<Moment | null> {
  const { data, error } = await supabase.rpc("get_random_moment");
  if (error || !data || data.length === 0) return null;
  return mapRowToMoment(data[0]);
}

async function fetchRewindMoments(userId: string, monthKey: string): Promise<Moment[]> {
  const [y, m] = monthKey.split("-").map(Number);
  const start = `${monthKey}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_CARD_COLUMNS)
    .eq("user_id", userId)
    .gte("moment_date", start)
    .lt("moment_date", end)
    .order("moment_date", { ascending: true })
    .limit(3);
  if (error) throw error;
  return (data ?? []).map(mapRowToMoment);
}

/**
 * ISO-week seed (year*100 + week): the Weekly Rewind picks the same month for
 * seven days straight, then moves on — a slow rotation you can come back to,
 * unlike the old day-seeded spotlights that changed under you every morning.
 */
function isoWeekSeed(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return date.getUTCFullYear() * 100 + week;
}

// ── derived strip data (from the shared browseMeta cache) ──────────────

function deriveMoodCounts(meta: BrowseMeta[], allMoods: { value: string; emoji: string; label: string }[]) {
  const counts: Record<string, number> = {};
  for (const m of meta) {
    for (const mood of m.moods) counts[mood] = (counts[mood] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([mood, count]) => {
      const def = allMoods.find((m) => m.value === mood);
      return { mood, count, emoji: def?.emoji ?? "🎵", label: def?.label ?? mood };
    });
}

function derivePeopleCounts(meta: BrowseMeta[]) {
  const counts: Record<string, number> = {};
  for (const m of meta) {
    for (const p of m.people) counts[p] = (counts[p] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function deriveYearCounts(meta: BrowseMeta[]) {
  const counts: Record<number, number> = {};
  for (const m of meta) {
    if (m.momentDate) {
      const y = new Date(m.momentDate + "T00:00:00").getFullYear();
      counts[y] = (counts[y] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, count]) => ({ year: Number(year), count }));
}

function deriveAlbumCounts(meta: BrowseMeta[]) {
  const seen = new Map<string, { albumName: string; artist: string; artworkUrl: string; count: number }>();
  for (const m of meta) {
    if (!m.songAlbumName) continue;
    const key = `${m.songAlbumName}|||${m.songArtist}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      seen.set(key, { albumName: m.songAlbumName, artist: m.songArtist, artworkUrl: m.songArtworkUrl, count: 1 });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count);
}

// ── strip sub-components (moved in from the old Browse tab) ────────────

function StripHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontSize: 10,
        fontFamily: "DMSans_700Bold",
        letterSpacing: 1.2,
        color: theme.colors.textTertiary,
        marginBottom: 10,
      }}
    >
      {label}
    </Text>
  );
}

function MoodCard({ emoji, label, count, onPress }: {
  emoji: string; label: string; count: number; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginRight: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.cardBg,
        alignItems: "center",
        minWidth: 90,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={{ fontSize: 12, fontFamily: "DMSans_600SemiBold", color: theme.colors.text, marginTop: 6 }}>{label}</Text>
      <Text style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{count}</Text>
    </TouchableOpacity>
  );
}

function PersonCircle({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginRight: 12, alignItems: "center" }}>
      <LinearGradient
        colors={["#E8825C", "#6B5F8C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 54, height: 54, borderRadius: 27,
          alignItems: "center", justifyContent: "center",
          borderWidth: 2, borderColor: theme.colors.background,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "DMSerifDisplay_400Regular", color: theme.colors.buttonText }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </LinearGradient>
      <Text style={{ fontSize: 11, fontFamily: "DMSans_500Medium", color: theme.colors.text, marginTop: 5 }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{count}</Text>
    </TouchableOpacity>
  );
}

function YearChip({ year, count, onPress }: { year: number; count: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginRight: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: theme.radii.full,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 16, fontFamily: "DMSerifDisplay_400Regular", color: theme.colors.text }}>{year}</Text>
      <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 1 }}>{count} moments</Text>
    </TouchableOpacity>
  );
}

function AlbumCard({ albumName, count, artworkUrl, onPress }: {
  albumName: string; artist: string; artworkUrl: string; count: number; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginRight: 10, width: 100 }}>
      {artworkUrl ? (
        <AppImage source={{ uri: artworkUrl }} style={{ width: 100, height: 100, borderRadius: theme.radii.md }} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={["#E8825C", "#6B5F8C"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 100, height: 100, borderRadius: theme.radii.md, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="musical-notes" size={28} color="rgba(255,255,255,0.8)" />
        </LinearGradient>
      )}
      <Text style={{ fontSize: 12, fontFamily: "DMSans_600SemiBold", color: theme.colors.text, marginTop: 6 }} numberOfLines={1}>
        {albumName}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }} numberOfLines={1}>
        {count} moments
      </Text>
    </TouchableOpacity>
  );
}

// ── screen ─────────────────────────────────────────────────────────────

export default function ReflectionsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<TextInput>(null);

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
    const currentMonthKey = `${thisYear}-${month}`;
    const weekSeed = isoWeekSeed(now);
    return { month, day, thisYear, todayLabel, currentMonthKey, weekSeed };
  }, []);

  const { month, day, thisYear, todayLabel, currentMonthKey, weekSeed } = dateParams;

  const {
    data: onThisDay = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    errorUpdatedAt,
  } = useQuery({
    queryKey: ["reflections", user?.id],
    queryFn: () => fetchOnThisDay(user!.id, month, day, thisYear),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && onThisDay.length > 0 && errorUpdatedAt > bannerDismissedAt;

  // Random moment: sticky between tab navigations, only changes on shuffle
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

  // Browse metadata — the archive strips and the rewind's month list all
  // derive from this one shared cache.
  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const moodCounts = useMemo(() => deriveMoodCounts(meta, allMoods), [meta, allMoods]);
  const peopleCounts = useMemo(() => derivePeopleCounts(meta), [meta]);
  const yearCounts = useMemo(() => deriveYearCounts(meta), [meta]);
  const albumCounts = useMemo(() => deriveAlbumCounts(meta), [meta]);

  // Weekly Rewind: the ISO-week seed picks one past month from the library.
  const rewindMonthKey = useMemo(() => {
    const months = [
      ...new Set(
        meta
          .filter((m) => m.momentDate)
          .map((m) => m.momentDate!.slice(0, 7))
      ),
    ]
      .filter((mm) => mm !== currentMonthKey)
      .sort();
    if (months.length === 0) return null;
    return months[weekSeed % months.length];
  }, [meta, currentMonthKey, weekSeed]);

  const rewindLabel = useMemo(
    () =>
      rewindMonthKey
        ? new Date(rewindMonthKey + "-01T00:00:00").toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })
        : null,
    [rewindMonthKey]
  );

  const { data: rewindMoments = [] } = useQuery({
    queryKey: ["weeklyRewind", user?.id, rewindMonthKey],
    queryFn: () => fetchRewindMoments(user!.id, rewindMonthKey!),
    enabled: !!user && !!rewindMonthKey,
    staleTime: STALE_TIME,
  });

  useFocusEffect(
    useCallback(() => {
      // Timeline search icon lands here wanting the search bar up and focused.
      if (consumeReflectionsSearchRequest()) {
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 250);
      }
      if (!dataUpdatedAt || Date.now() - dataUpdatedAt > STALE_TIME) {
        refetch();
      }
    }, [refetch, dataUpdatedAt])
  );

  const handleShuffle = useCallback(() => {
    refetchRandom();
  }, [refetchRandom]);

  const handleSearchClose = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
    searchInputRef.current?.blur();
  }, []);

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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  if (isError && onThisDay.length === 0 && meta.length === 0) {
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
  if (randomMoment === null && onThisDay.length === 0 && meta.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Reflections</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Your memories resurface here.</Text>
          <Text style={styles.emptyBody}>
            On This Day, a weekly rewind, your moods and years — the songs that
            marked your life, brought back to you.
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

      {/* Search — the archive's front door, always visible */}
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textTertiary} style={{ marginLeft: 12 }} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchBarInput}
          placeholder="Search songs, artists, reflections…"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          value={searchText}
          onChangeText={(t) => { setSearchText(t); if (!searchActive) setSearchActive(true); }}
          onFocus={() => setSearchActive(true)}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchActive ? (
          <TouchableOpacity onPress={handleSearchClose} hitSlop={8} style={{ marginRight: 12 }}>
            <Text style={{ fontSize: 14, fontFamily: "DMSans_500Medium", color: theme.colors.accent }}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {searchActive ? (
        <MomentSearch query={searchText} userId={user?.id ?? ""} />
      ) : (
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

          {/* ── On This Day ── */}
          {byYear.length > 0 && (
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

          {/* ── Weekly Rewind ── */}
          {rewindLabel && rewindMoments.length > 0 && (
            <>
              <View style={[styles.sectionRow, byYear.length > 0 && styles.sectionRowSpaced]}>
                <Text style={styles.heroTitle}>Weekly Rewind</Text>
                <Text style={styles.sectionSubtitle}>{rewindLabel}</Text>
              </View>
              {rewindMoments.map((m) => (
                <MomentCard key={m.id} item={m} allMoods={allMoods} />
              ))}
            </>
          )}

          {/* ── The archive strips ── */}
          {moodCounts.length > 0 && (
            <View style={styles.stripSection}>
              <StripHeader label="MOODS" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
                {moodCounts.map(({ mood, emoji, label, count }) => (
                  <MoodCard
                    key={mood}
                    emoji={emoji}
                    label={label}
                    count={count}
                    onPress={() => router.push({ pathname: "/browse/mood", params: { value: mood } })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {peopleCounts.length > 0 && (
            <View style={styles.stripSection}>
              <StripHeader label="PEOPLE" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
                {peopleCounts.map(({ name, count }) => (
                  <PersonCircle
                    key={name}
                    name={name}
                    count={count}
                    onPress={() => router.push({ pathname: "/browse/person", params: { name } })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {yearCounts.length > 0 && (
            <View style={styles.stripSection}>
              <StripHeader label="YEARS" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
                {yearCounts.map(({ year, count }) => (
                  <YearChip
                    key={year}
                    year={year}
                    count={count}
                    onPress={() => router.push({ pathname: "/browse/year", params: { year: String(year) } })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {albumCounts.length > 0 && (
            <View style={styles.stripSection}>
              <StripHeader label="ALBUMS" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
                {albumCounts.map(({ albumName, artist, artworkUrl, count }) => (
                  <AlbumCard
                    key={`${albumName}|||${artist}`}
                    albumName={albumName}
                    artist={artist}
                    artworkUrl={artworkUrl}
                    count={count}
                    onPress={() => router.push({ pathname: "/browse/album", params: { album: albumName, artist } })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Surprise Me ── */}
          {randomMoment && (
            <>
              <View style={[styles.sectionRow, styles.sectionRowSpaced]}>
                <Text style={styles.sectionTitle}>Surprise Me</Text>
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
      )}
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
      paddingBottom: theme.spacing.md,
    },
    title: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    searchBarWrapper: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      gap: 8,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.text,
      paddingVertical: 10,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
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
    stripSection: {
      marginTop: theme.spacing["3xl"],
    },
    stripContent: {
      paddingRight: theme.spacing.xl,
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
