import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { consumeTimelineStale } from "@/lib/timelineRefresh";
import {
  consumePrefetchPromise,
  consumePrefetchNetworkPromise,
  TIMELINE_PAGE_SIZE,
} from "@/lib/timelinePrefetch";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { requestReflectionsSearch } from "@/lib/reflectionsSearch";
import { fetchUnviewedSharedCount } from "@/lib/momentShares";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";
import { IconButton } from "@/components/IconButton";
import { Ionicons } from "@expo/vector-icons";
import { CalendarView } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 30_000;
// Unread-shares count is a badge-style query — 60s staleTime per the convention.
const SHARED_BADGE_STALE_MS = 60_000;

export default function TimelineScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const posthog = usePostHog();

  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const lastFetchTime = useRef(0);
  const pageRef = useRef(0);
  // Blocks load-more while a refresh is resetting pageRef, so the two can't
  // interleave and leave pageRef describing something other than what's rendered.
  const refreshInFlightRef = useRef(false);


  // Snapshot of the full timeline so calendar can derive data without another query
  const timelineSnapshotRef = useRef<{ moments: Moment[]; hasMore: boolean } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMoments, setCalendarMoments] = useState<Moment[]>([]);
  const calendarFetchedRef = useRef<null | boolean>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Shared with you (Sharing v2) lives under You since Phase 1. The Journal
  // only carries a quiet "new from friends" row, driven by the cheap unread
  // count; /shared invalidates it once things are seen.
  const { data: unviewedCount = 0, refetch: refetchUnviewed, dataUpdatedAt: unviewedUpdatedAt } = useQuery({
    queryKey: ["sharedUnviewed", user?.id],
    queryFn: () => fetchUnviewedSharedCount(user!.id),
    staleTime: SHARED_BADGE_STALE_MS,
    enabled: !!user,
  });

  // Clear data on user change (sign out / sign in as different user)
  useEffect(() => {
    setMoments([]);
    setCalendarMoments([]);
    calendarFetchedRef.current = null;
    lastFetchTime.current = 0;
    timelineSnapshotRef.current = null;
  }, [user?.id]);

  const sectionListRef = useRef<SectionList>(null);

  const listOpacity = useSharedValue(1);
  const calendarOpacity = useSharedValue(0);
  const listAnimStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const calendarAnimStyle = useAnimatedStyle(() => ({ opacity: calendarOpacity.value }));

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const fetchCalendarMoments = useCallback(async () => {
    if (!user) return;
    setCalendarLoading(true);

    const snapshot = timelineSnapshotRef.current;
    if (snapshot && !snapshot.hasMore) {
      setCalendarMoments(snapshot.moments);
      calendarFetchedRef.current = true;
      setCalendarLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("moments")
      .select("id, moment_date, song_artwork_url, song_title, song_artist")
      .eq("user_id", user.id)
      .order("moment_date", { ascending: false, nullsFirst: false });
    if (!error && data) {
      setCalendarMoments(
        data.map((r: any): Moment => ({
          id: r.id,
          momentDate: r.moment_date ?? null,
          songArtworkUrl: r.song_artwork_url ?? "",
          songTitle: r.song_title ?? "",
          songArtist: r.song_artist ?? "",
          locationLat: null,
          locationLng: null,
          userId: "", reflectionText: "", photoUrls: [], photoThumbnails: [],
          moods: [], people: [], location: null, timeOfDay: null,
          weatherTempF: null, weatherCondition: null,
          createdAt: "", updatedAt: "", songAlbumName: "",
          songProvider: "apple_music", songAppleMusicId: null, songSpotifyId: null,
          songPreviewUrl: null,
        }))
      );
      calendarFetchedRef.current = true;
    } else {
      calendarFetchedRef.current = false;
    }
    setCalendarLoading(false);
  }, [user]);

  const switchToList = useCallback(() => {
    if (viewModeRef.current !== "list") {
      calendarOpacity.value = withTiming(0, { duration: 200 });
      listOpacity.value = withTiming(1, { duration: 200 });
      setViewMode("list");
    }
  }, []);

  const switchToCalendar = useCallback(() => {
    if (viewModeRef.current !== "calendar") {
      listOpacity.value = withTiming(0, { duration: 200 });
      calendarOpacity.value = withTiming(1, { duration: 200 });
      setViewMode("calendar");
      if (calendarFetchedRef.current !== true) fetchCalendarMoments();
    }
  }, [fetchCalendarMoments]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch().onEnd((e) => {
        "worklet";
        if (e.scale < 0.75) {
          runOnJS(switchToList)();
        } else if (e.scale > 1.3) {
          runOnJS(switchToCalendar)();
        }
      }),
    [switchToList, switchToCalendar]
  );

  const navigation = useNavigation();

  useEffect(() => {
    return navigation.addListener("tabPress" as any, () => {
      if (viewMode === "calendar") {
        calendarOpacity.value = withTiming(0, { duration: 200 });
        listOpacity.value = withTiming(1, { duration: 200 });
        setViewMode("list");
      }
    });
  }, [navigation, viewMode]);

  const toggleView = useCallback(() => {
    if (viewMode === "list") {
      listOpacity.value = withTiming(0, { duration: 200 });
      calendarOpacity.value = withTiming(1, { duration: 200 });
      setViewMode("calendar");
      if (calendarFetchedRef.current !== true) fetchCalendarMoments();
    } else {
      calendarOpacity.value = withTiming(0, { duration: 200 });
      listOpacity.value = withTiming(1, { duration: 200 });
      setViewMode("list");
    }
  }, [viewMode, fetchCalendarMoments]);

  const handleDayPress = useCallback((momentId: string) => {
    calendarOpacity.value = withTiming(0, { duration: 200 });
    listOpacity.value = withTiming(1, { duration: 200 });
    setViewMode("list");
    setPendingScrollId(momentId);
  }, []);

  const sections = useMemo(() => {
    const grouped: Record<string, Moment[]> = {};
    for (const m of moments) {
      const key = m.momentDate
        ? new Date(m.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : "No Date";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [moments]);

  useEffect(() => {
    if (!pendingScrollId || sections.length === 0) return;
    for (let s = 0; s < sections.length; s++) {
      const idx = sections[s].data.findIndex((m) => m.id === pendingScrollId);
      if (idx >= 0) {
        setPendingScrollId(null);
        setTimeout(() => {
          try {
            sectionListRef.current?.scrollToLocation({
              sectionIndex: s,
              itemIndex: idx,
              viewPosition: 0.3,
              animated: false,
            });
          } catch {}
        }, 100);
        return;
      }
    }
  }, [pendingScrollId, sections]);

  const fetchMomentsInner = useCallback(
    async (showLoading: boolean, append = false) => {
      if (!user) return;
      if (!append) {
        pageRef.current = 0;
        refreshInFlightRef.current = true;
      }
      if (showLoading) setLoading(true);
      const t0 = Date.now();

      if (showLoading && !append) {
        const prefetchPromise = consumePrefetchPromise(user.id);
        if (prefetchPromise) {
          const prefetched = await prefetchPromise.catch(() => null);
          if (prefetched !== null) {
            const nextHasMore = prefetched.length === TIMELINE_PAGE_SIZE;
            setMoments(prefetched);
            setHasMore(nextHasMore);
            timelineSnapshotRef.current = { moments: prefetched, hasMore: nextHasMore };
            setLoading(false);
            lastFetchTime.current = Date.now();
            posthog?.capture("timeline_load", {
              source: "cold_start",
              served_from: "prefetch_cache",
              duration_ms: Date.now() - t0,
              moment_count: prefetched.length,
            });

            // The paint above may have come from the disk cache, i.e. the server
            // state as of the previous launch. Apply the network result when it
            // lands so a moment created last session isn't silently missing.
            const networkPromise = consumePrefetchNetworkPromise(user.id);
            if (networkPromise) {
              networkPromise
                .then((fresh) => {
                  if (fresh === null) return; // offline — keep showing cache
                  const freshHasMore = fresh.length === TIMELINE_PAGE_SIZE;
                  setMoments(fresh);
                  setHasMore(freshHasMore);
                  timelineSnapshotRef.current = { moments: fresh, hasMore: freshHasMore };
                })
                .catch(() => {});
            }
            return;
          }
        }
      }
      setBannerError("");
      if (showLoading) setError("");

      // Restore cached snapshot instantly so the user sees content while fresh fetch runs
      if (!append && timelineSnapshotRef.current) {
        setMoments(timelineSnapshotRef.current.moments);
        setHasMore(timelineSnapshotRef.current.hasMore);
        setLoading(false);
      }

      const from = pageRef.current * TIMELINE_PAGE_SIZE;
      const { data, error: fetchError } = await supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS)
        .eq("user_id", user!.id)
        .order("moment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, from + TIMELINE_PAGE_SIZE - 1);

      if (fetchError) {
        if (showLoading) {
          setError(friendlyError(fetchError));
        } else {
          setBannerError(friendlyError(fetchError));
        }
        // Roll back the optimistic page increment from handleLoadMore. Without
        // this, the next load-more skips a whole page and those moments never
        // appear until the app restarts.
        if (append && pageRef.current > 0) pageRef.current -= 1;
        setLoading(false);
        return;
      }

      const mapped: Moment[] = (data ?? []).map(mapRowToMoment);

      if (append) {
        setMoments((prev) => [...prev, ...mapped]);
      } else {
        setMoments(mapped);
      }
      const nextHasMore = mapped.length === TIMELINE_PAGE_SIZE;
      setHasMore(nextHasMore);
      setLoading(false);
      lastFetchTime.current = Date.now();

      if (!append) {
        posthog?.capture("timeline_load", {
          source: showLoading ? "cold_start" : "background_refresh",
          served_from: "network",
          duration_ms: Date.now() - t0,
          moment_count: mapped.length,
        });
      }

      if (!append) {
        timelineSnapshotRef.current = { moments: mapped, hasMore: nextHasMore };
      }
    },
    [user, posthog]
  );

  const fetchMoments = useCallback(
    async (showLoading: boolean, append = false) => {
      try {
        await fetchMomentsInner(showLoading, append);
      } finally {
        if (!append) refreshInFlightRef.current = false;
      }
    },
    [fetchMomentsInner]
  );

  const handleLoadMore = useCallback(async () => {
    // Don't append while a refresh is resetting pageRef — the two racing would
    // leave pageRef out of sync with what's rendered and skip a page.
    if (!hasMore || loadingMore || refreshInFlightRef.current) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchMoments(false, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchMoments]);

  useFocusEffect(
    useCallback(() => {
      const { stale, pendingMoment, deletedMomentId } = consumeTimelineStale();
      const elapsed = Date.now() - lastFetchTime.current;

      if (pendingMoment && timelineSnapshotRef.current) {
        const updated = [pendingMoment, ...timelineSnapshotRef.current.moments];
        timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        setMoments(updated);
      }

      if (deletedMomentId) {
        const filter = (list: Moment[]) => list.filter((m) => m.id !== deletedMomentId);
        if (timelineSnapshotRef.current) {
          const updated = filter(timelineSnapshotRef.current.moments);
          timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        }
        setMoments((prev) => prev.filter((m) => m.id !== deletedMomentId));
      }

      if (stale) calendarFetchedRef.current = null;
      if (viewModeRef.current === "calendar" && calendarFetchedRef.current !== true) fetchCalendarMoments();
      if (lastFetchTime.current === 0) {
        fetchMoments(true);
      } else if (stale || elapsed >= REFETCH_COOLDOWN_MS) {
        fetchMoments(false);
      }

      // The "new from friends" row's count, on the badge cooldown.
      if (user && Date.now() - unviewedUpdatedAt >= SHARED_BADGE_STALE_MS) refetchUnviewed();
    }, [fetchMoments, fetchCalendarMoments, user, unviewedUpdatedAt, refetchUnviewed])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    calendarFetchedRef.current = null;
    await Promise.all([fetchMoments(false), fetchCalendarMoments(), refetchUnviewed()]);
    setRefreshing(false);
  }, [fetchMoments, fetchCalendarMoments, refetchUnviewed]);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  // In-place removal for long-press delete: the stale signal set by
  // deleteMomentWithCleanup only takes effect on the next focus, and deleting
  // from the card never leaves the screen.
  const handleCardDeleted = useCallback((deletedId: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== deletedId));
    setCalendarMoments((prev) => prev.filter((m) => m.id !== deletedId));
  }, []);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard item={item} allMoods={allMoods} onDeleted={handleCardDeleted} />
  ), [allMoods, handleCardDeleted]);

  const listHeader = (
    <>
      {unviewedCount > 0 ? (
        <TouchableOpacity
          style={styles.sharedRow}
          onPress={() => {
            posthog?.capture("shared_with_me_opened", { unviewed_count: unviewedCount, from: "journal_row" });
            router.push("/shared");
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.sharedDot} />
          <Text style={styles.sharedRowText}>
            {unviewedCount === 1 ? "1 new from friends" : `${unviewedCount} new from friends`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      ) : null}
      {bannerError ? (
        <ErrorBanner
          message={bannerError}
          onRetry={() => fetchMoments(false)}
          onDismiss={() => setBannerError("")}
        />
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Title row */}
        <View style={styles.headerTop}>
          <Text style={styles.title}>Journal</Text>
          <View style={styles.headerRight}>
            {/* The archive lives in Rediscover — land there with search up */}
            <IconButton
              name="search-outline"
              accessibilityLabel="Search"
              onPress={() => {
                requestReflectionsSearch();
                router.push("/(tabs)/reflections" as any);
              }}
            />
            {/* One control for the three ways to see the journal. List and
                calendar are in-place views of My Moments (both stay mounted);
                map is its own screen. */}
            <View style={styles.segmented} accessibilityRole="tablist">
              {([
                { key: "list", icon: "list-outline", label: "List" },
                { key: "calendar", icon: "calendar-outline", label: "Calendar" },
                { key: "map", icon: "map-outline", label: "Map" },
              ] as const).map((seg) => {
                const active = seg.key !== "map" && viewMode === seg.key;
                return (
                  <TouchableOpacity
                    key={seg.key}
                    style={[styles.segment, active && styles.segmentActive]}
                    accessibilityRole="tab"
                    accessibilityLabel={seg.label}
                    accessibilityState={{ selected: active }}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (seg.key === "map") router.push("/moments-map" as any);
                      else if (viewMode !== seg.key) toggleView();
                    }}
                  >
                    <Ionicons
                      name={seg.icon}
                      size={17}
                      color={active ? theme.colors.text : theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <GestureDetector gesture={pinchGesture}>
          <View style={styles.viewsContainer}>
            <Animated.View style={[StyleSheet.absoluteFill, listAnimStyle]} pointerEvents={viewMode === "list" ? "auto" : "none"}>
              {loading && moments.length === 0 ? (
                <View style={styles.skeletonList}>
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonTimelineCard key={i} />
                  ))}
                </View>
              ) : error ? (
                <ErrorState
                  message={error}
                  onRetry={() => fetchMoments(true)}
                />
              ) : moments.length === 0 && !loading ? (
                <EmptyState
                  icon="musical-notes-outline"
                  title="No moments yet"
                  subtitle={"A moment is a song paired with a memory —\nwhat you felt, who you were with, and why it mattered."}
                  action={{ label: "Create Your First Moment", onPress: () => router.push("/create") }}
                />
              ) : (
                <SectionList
                  ref={sectionListRef}
                  sections={sections}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMoment}
                  renderSectionHeader={({ section: { title } }) => {
                    // "October 2026" -> small caps month, muted year.
                    const split = title.lastIndexOf(" ");
                    const month = split > 0 ? title.slice(0, split) : title;
                    const year = split > 0 ? title.slice(split + 1) : "";
                    return (
                      <View style={styles.sectionHeader} accessibilityRole="header">
                        <Text style={styles.sectionMonth}>{month.toUpperCase()}</Text>
                        {year ? <Text style={styles.sectionYear}>{year}</Text> : null}
                      </View>
                    );
                  }}
                  ListHeaderComponent={listHeader}
                  onEndReached={handleLoadMore}
                  removeClippedSubviews
                  windowSize={10}
                  maxToRenderPerBatch={5}
                  initialNumToRender={10}
                  onEndReachedThreshold={0.3}
                  ListFooterComponent={
                    loadingMore ? (
                      <ActivityIndicator
                        style={{ paddingVertical: 20 }}
                        color={theme.colors.accent}
                      />
                    ) : null
                  }
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  stickySectionHeadersEnabled={false}
                  keyboardDismissMode="on-drag"
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={theme.colors.text}
                    />
                  }
                />
              )}
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, calendarAnimStyle]} pointerEvents={viewMode === "calendar" ? "auto" : "none"}>
              <CalendarView moments={calendarMoments} onDayPress={handleDayPress} theme={theme} loading={calendarLoading} />
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 58,
      paddingBottom: theme.spacing.xs,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.sm,
    },
    title: {
      fontSize: 34,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      lineHeight: 40,
      letterSpacing: -0.3,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    segmented: {
      flexDirection: "row",
      alignItems: "center",
      padding: 3,
      gap: 2,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
    },
    segment: {
      width: 36,
      height: 32,
      borderRadius: theme.radii.full,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: theme.colors.background,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: theme.isDark ? 0 : 0.08,
      shadowRadius: 2,
    },
    sharedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      marginBottom: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    sharedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    sharedRowText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    viewsContainer: {
      flex: 1,
    },
    skeletonList: {
      paddingHorizontal: theme.spacing.xl,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: theme.spacing.sm,
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.xs,
      backgroundColor: theme.colors.background,
    },
    sectionMonth: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 1,
      color: theme.colors.text,
    },
    sectionYear: {
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      // Clears the floating capture button so the last entry is never under it.
      paddingBottom: 110,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 14 + 46 + 12,
    },
  });
}
