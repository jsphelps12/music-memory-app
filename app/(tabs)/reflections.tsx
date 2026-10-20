import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppState,
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
import { BottomSheet } from "@/components/BottomSheet";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { setCachedMoment } from "@/lib/momentCache";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { pad, dateToStr } from "@/lib/dateUtils";
import { artworkUrlAtSize } from "@/lib/itunes";
import { moodLabel } from "@/lib/moodLabels";
import { Moment } from "@/types";
import {
  BROWSE_META_STALE,
  REFLECTIONS_STALE,
  REFLECTIONS_RANDOM_STALE,
} from "@/lib/queryConfig";

// Reflections reorg (2026-08): the archive (old Browse tab) merged INTO this
// screen. Order is deliberate — resurfacing first, browsing second:
// search · On This Day · Weekly Rewind · Browse by · Surprise Me.
// Phase 1 (2026-10): the boxed mood tiles, gradient avatars and year pills
// became four "Browse by" rows, each opening a quick-pick sheet; On This Day
// leads with its oldest memory as a hero. The rotating person/mood/artist spotlights are gone: the strips
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
    .flatMap(([mood, count]) => {
      // A deleted custom mood has only its generated id left: leave it out.
      const label = moodLabel(mood, allMoods);
      if (!label) return [];
      const def = allMoods.find((m) => m.value === mood);
      return [{ mood, count, emoji: def?.emoji ?? "🎵", label }];
    });
}

// Artwork is stored at 600px; rows ask for what they draw (at 3x).
const HERO_ARTWORK_PX = 396;
const ROW_ARTWORK_PX = 144;
const SHEET_ARTWORK_PX = 120;

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

// ── sub-components ─────────────────────────────────────────────────────

type BrowseKind = "mood" | "people" | "year" | "album";

function yearsAgoLabel(n: number) {
  return n === 1 ? "1 year ago" : `${n} years ago`;
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function openMoment(router: ReturnType<typeof useRouter>, moment: Moment) {
  setCachedMoment(moment);
  router.push({ pathname: "/moment/[id]", params: { id: moment.id } });
}

function OnThisDayHero({ moment, yearsAgo, onPress }: { moment: Moment; yearsAgo: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.heroRow} activeOpacity={0.8} onPress={onPress} accessibilityRole="button">
      {moment.songArtworkUrl ? (
        <AppImage source={{ uri: artworkUrlAtSize(moment.songArtworkUrl, HERO_ARTWORK_PX) }} style={styles.heroArtwork} />
      ) : (
        <ArtworkPlaceholder style={styles.heroArtwork} />
      )}
      <View style={styles.heroText}>
        <Text style={styles.heroAgo}>{yearsAgoLabel(yearsAgo)}</Text>
        <Text style={styles.heroSong} numberOfLines={1}>
          {moment.songTitle} · {moment.songArtist}
        </Text>
        {moment.reflectionText ? (
          <Text style={styles.heroExcerpt} numberOfLines={4}>{excerpt(moment.reflectionText)}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function OnThisDayRow({ moment, yearsAgo, onPress }: { moment: Moment; yearsAgo: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.otdRow} activeOpacity={0.7} onPress={onPress} accessibilityRole="button">
      {moment.songArtworkUrl ? (
        <AppImage source={{ uri: artworkUrlAtSize(moment.songArtworkUrl, ROW_ARTWORK_PX) }} style={styles.otdArtwork} />
      ) : (
        <ArtworkPlaceholder style={styles.otdArtwork} />
      )}
      <View style={styles.otdText}>
        <Text style={styles.otdTitle} numberOfLines={1}>
          {yearsAgoLabel(yearsAgo)} · {moment.songTitle}
        </Text>
        {moment.reflectionText ? (
          <Text style={styles.otdExcerpt} numberOfLines={1}>{excerpt(moment.reflectionText)}</Text>
        ) : (
          <Text style={styles.otdExcerpt} numberOfLines={1}>{moment.songArtist}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function BrowseRow({ label, detail, onPress, last }: { label: string; detail: string; onPress: () => void; last?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity
      style={[styles.browseRow, !last && styles.browseRowDivider]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse by ${label.toLowerCase()}, ${detail}`}
    >
      <Text style={styles.browseLabel}>{label}</Text>
      <View style={styles.browseRight}>
        <Text style={styles.browseDetail}>{detail}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function SheetRow({ label, sublabel, count, artworkUrl, onPress }: {
  label: string; sublabel?: string; count: number; artworkUrl?: string; onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity style={styles.sheetRow} activeOpacity={0.7} onPress={onPress} accessibilityRole="button">
      {artworkUrl !== undefined ? (
        artworkUrl ? (
          <AppImage source={{ uri: artworkUrlAtSize(artworkUrl, SHEET_ARTWORK_PX) }} style={styles.sheetArtwork} />
        ) : (
          <ArtworkPlaceholder style={styles.sheetArtwork} />
        )
      ) : null}
      <View style={styles.sheetRowText}>
        <Text style={styles.sheetRowLabel} numberOfLines={1}>{label}</Text>
        {sublabel ? <Text style={styles.sheetRowSublabel} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      <Text style={styles.sheetRowCount}>{count}</Text>
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
  const [browseSheet, setBrowseSheet] = useState<BrowseKind | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  // Today's local date. The tab stays mounted while the app sits in the
  // background, so it's re-read on focus and on return to the foreground;
  // computing it once on mount froze On This Day to the day the tab mounted.
  const [todayKey, setTodayKey] = useState(() => dateToStr(new Date()));
  const refreshToday = useCallback(() => {
    const key = dateToStr(new Date());
    setTodayKey((prev) => (prev === key ? prev : key));
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshToday();
    });
    return () => sub.remove();
  }, [refreshToday]);

  const dateParams = useMemo(() => {
    const now = new Date(todayKey + "T00:00:00");
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const thisYear = now.getFullYear();
    const todayLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const currentMonthKey = `${thisYear}-${month}`;
    const weekSeed = isoWeekSeed(now);
    return { month, day, thisYear, todayLabel, currentMonthKey, weekSeed };
  }, [todayKey]);

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
    // The date is part of the key; invalidating ["reflections", userId]
    // still matches it by prefix.
    queryKey: ["reflections", user?.id, todayKey],
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
      refreshToday();
      // Timeline search icon lands here wanting the search bar up and focused.
      if (consumeReflectionsSearchRequest()) {
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 250);
      }
      if (!dataUpdatedAt || Date.now() - dataUpdatedAt > STALE_TIME) {
        refetch();
      }
    }, [refetch, dataUpdatedAt, refreshToday])
  );

  const handleShuffle = useCallback(() => {
    refetchRandom();
  }, [refetchRandom]);

  const handleSearchClose = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
    searchInputRef.current?.blur();
  }, []);

  // On This Day, oldest first: the furthest-back memory is the hero.
  const onThisDaySorted = useMemo(
    () =>
      onThisDay
        .map((moment) => ({
          moment,
          yearsAgo: thisYear - new Date(moment.momentDate! + "T00:00:00").getFullYear(),
        }))
        .sort((a, b) => b.yearsAgo - a.yearsAgo),
    [onThisDay, thisYear]
  );

  const browseRows = useMemo(() => {
    const rows: { kind: BrowseKind; label: string; detail: string }[] = [];
    if (moodCounts.length) rows.push({ kind: "mood", label: "Mood", detail: String(moodCounts.length) });
    if (peopleCounts.length) rows.push({ kind: "people", label: "People", detail: String(peopleCounts.length) });
    if (yearCounts.length) {
      const newest = yearCounts[0].year;
      const oldest = yearCounts[yearCounts.length - 1].year;
      rows.push({ kind: "year", label: "Year", detail: newest === oldest ? String(newest) : `${oldest}–${newest}` });
    }
    if (albumCounts.length) rows.push({ kind: "album", label: "Album", detail: String(albumCounts.length) });
    return rows;
  }, [moodCounts, peopleCounts, yearCounts, albumCounts]);

  const browseTo = (href: Parameters<typeof router.push>[0]) => {
    setBrowseSheet(null);
    router.push(href);
  };

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
          <Text style={styles.title}>Rediscover</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Your memories resurface here</Text>
          <Text style={styles.emptyBody}>
            On this day, a weekly rewind, your moods and years: the songs that
            marked your life, brought back to you.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push("/create")}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyButtonText}>Capture a song</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rediscover</Text>
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
          {onThisDaySorted.length > 0 && (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>On this day</Text>
                <Text style={styles.sectionDetail}>{todayLabel}</Text>
              </View>
              <OnThisDayHero
                moment={onThisDaySorted[0].moment}
                yearsAgo={onThisDaySorted[0].yearsAgo}
                onPress={() => openMoment(router, onThisDaySorted[0].moment)}
              />
              {onThisDaySorted.slice(1).map(({ moment, yearsAgo }) => (
                <OnThisDayRow
                  key={moment.id}
                  moment={moment}
                  yearsAgo={yearsAgo}
                  onPress={() => openMoment(router, moment)}
                />
              ))}
            </View>
          )}

          {/* ── Weekly Rewind ── */}
          {rewindLabel && rewindMoments.length > 0 && (
            <View style={onThisDaySorted.length > 0 && styles.sectionSpaced}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>From {rewindLabel}</Text>
              </View>
              {rewindMoments.map((m) => (
                <MomentCard key={m.id} item={m} allMoods={allMoods} />
              ))}
            </View>
          )}

          {/* ── Browse by ── */}
          {browseRows.length > 0 && (
            <View style={styles.sectionSpaced}>
              <Text style={styles.sectionTitle}>Browse by</Text>
              <View style={styles.browseList}>
                {browseRows.map((row, i) => (
                  <BrowseRow
                    key={row.kind}
                    label={row.label}
                    detail={row.detail}
                    last={i === browseRows.length - 1}
                    onPress={() => setBrowseSheet(row.kind)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Surprise Me ── */}
          {randomMoment && (
            <View style={styles.sectionSpaced}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Surprise me</Text>
                <TouchableOpacity
                  onPress={handleShuffle}
                  disabled={shuffling}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Shuffle"
                >
                  {shuffling ? (
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                  ) : (
                    <Ionicons name="shuffle" size={20} color={theme.colors.text} />
                  )}
                </TouchableOpacity>
              </View>
              <MomentCard item={randomMoment} allMoods={allMoods} />
            </View>
          )}
        </ScrollView>
      )}

      <BottomSheet visible={browseSheet === "mood"} onClose={() => setBrowseSheet(null)} title="Mood">
        <ScrollView contentContainerStyle={styles.sheetList}>
          {moodCounts.map(({ mood, label, count }) => (
            <SheetRow
              key={mood}
              label={label}
              count={count}
              onPress={() => browseTo({ pathname: "/browse/mood", params: { value: mood } })}
            />
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={browseSheet === "people"} onClose={() => setBrowseSheet(null)} title="People">
        <ScrollView contentContainerStyle={styles.sheetList}>
          {peopleCounts.map(({ name, count }) => (
            <SheetRow
              key={name}
              label={name}
              count={count}
              onPress={() => browseTo({ pathname: "/browse/person", params: { name } })}
            />
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={browseSheet === "year"} onClose={() => setBrowseSheet(null)} title="Year">
        <ScrollView contentContainerStyle={styles.sheetList}>
          {yearCounts.map(({ year, count }) => (
            <SheetRow
              key={year}
              label={String(year)}
              count={count}
              onPress={() => browseTo({ pathname: "/browse/year", params: { year: String(year) } })}
            />
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={browseSheet === "album"} onClose={() => setBrowseSheet(null)} title="Album">
        <ScrollView contentContainerStyle={styles.sheetList}>
          {albumCounts.map(({ albumName, artist, artworkUrl, count }) => (
            <SheetRow
              key={`${albumName}|||${artist}`}
              label={albumName}
              sublabel={artist}
              artworkUrl={artworkUrl}
              count={count}
              onPress={() => browseTo({ pathname: "/browse/album", params: { album: albumName, artist } })}
            />
          ))}
        </ScrollView>
      </BottomSheet>
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
      backgroundColor: theme.colors.chipBg,
      borderRadius: theme.radii.md,
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
      // Clears the floating tab bar and capture button.
      paddingBottom: 120,
    },
    sectionSpaced: {
      marginTop: 30,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: theme.fontSize.xl,
      lineHeight: 26,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    sectionDetail: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    heroRow: {
      flexDirection: "row",
      gap: theme.spacing.lg,
    },
    heroArtwork: {
      width: 132,
      height: 132,
      borderRadius: theme.radii.md,
    },
    heroText: {
      flex: 1,
    },
    heroAgo: {
      fontSize: theme.fontSize.xl,
      lineHeight: 26,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    heroSong: {
      marginTop: theme.spacing.xs,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    heroExcerpt: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.base,
      lineHeight: 23,
      fontFamily: theme.fonts.reading,
      color: theme.colors.text,
    },
    otdRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    otdArtwork: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    otdText: {
      flex: 1,
    },
    otdTitle: {
      fontSize: 15,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    otdExcerpt: {
      marginTop: 2,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    browseList: {
      marginTop: theme.spacing.sm,
    },
    browseRow: {
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    browseRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    browseLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    browseRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    browseDetail: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    sheetList: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    sheetRow: {
      minHeight: 48,
      paddingVertical: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    sheetArtwork: {
      width: 40,
      height: 40,
      borderRadius: 6,
    },
    sheetRowText: {
      flex: 1,
    },
    sheetRowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    sheetRowSublabel: {
      marginTop: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    sheetRowCount: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
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
      height: 44,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      justifyContent: "center",
    },
    emptyButtonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.buttonText,
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
