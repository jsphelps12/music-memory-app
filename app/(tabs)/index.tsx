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
  ScrollView,
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
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { consumeTimelineStale, planFocusFetch } from "@/lib/timelineRefresh";
import { shouldRefreshOnResume, useOnForeground } from "@/lib/appFocus";
import {
  consumePrefetchPromise,
  consumePrefetchNetworkPromise,
  discardTimelinePrefetch,
  getTimelineCacheGeneration,
  writeTimelineCache,
  insertPendingMoment,
  mergeFirstPage,
  appendPage,
  lastLoadedPage,
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
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Ionicons } from "@expo/vector-icons";
import { CalendarView, type CalendarMoment } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { DailyCheckInOffer } from "@/components/DailyCheckInOffer";
import { Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 30_000;
// One automatic retry when the launch network fetch fails after a cache paint.
const NETWORK_RETRY_MS = 5_000;
// Unread-shares count is a badge-style query — 60s staleTime per the convention.
const SHARED_BADGE_STALE_MS = 60_000;

export default function TimelineScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // Keyed on the id, not the user object: a token refresh replaces the object,
  // and that used to re-run the focus effect and refetch mid-scroll.
  const userId = user?.id;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
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
  // Set when the list on screen came from the disk cache and the network leg
  // failed. lastFetchTime is set by then (it also means "first load done"), so
  // without this the cooldown blocked the next focus/foreground refresh.
  const needsRefreshRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef(0);
  // Blocks load-more while a refresh is resetting pageRef, so the two can't
  // interleave and leave pageRef describing something other than what's rendered.
  const refreshInFlightRef = useRef(false);
  // Latest rendered list and hasMore, for merging a refreshed first page into
  // it outside a state updater.
  const momentsRef = useRef<Moment[]>(moments);
  momentsRef.current = moments;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  // Snapshot of the loaded timeline (every page) so the calendar can derive data without another query
  const timelineSnapshotRef = useRef<{ moments: Moment[]; hasMore: boolean } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMoments, setCalendarMoments] = useState<CalendarMoment[]>([]);
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
  // Read through a ref: as a focus-effect dependency it re-ran the effect on
  // every badge update, which during a cold start fired a second
  // fetchMoments(true) before the first had finished.
  const unviewedUpdatedAtRef = useRef(unviewedUpdatedAt);
  unviewedUpdatedAtRef.current = unviewedUpdatedAt;

  // Clear data on user change (sign out / sign in as different user)
  useEffect(() => {
    setMoments([]);
    momentsRef.current = [];
    pageRef.current = 0;
    setCalendarMoments([]);
    calendarFetchedRef.current = null;
    lastFetchTime.current = 0;
    needsRefreshRef.current = false;
    timelineSnapshotRef.current = null;
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, [userId]);

  const sectionListRef = useRef<SectionList>(null);

  const listOpacity = useSharedValue(1);
  const calendarOpacity = useSharedValue(0);
  const listAnimStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const calendarAnimStyle = useAnimatedStyle(() => ({ opacity: calendarOpacity.value }));

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // `silent`: a refresh of a calendar already on screen, without the spinner.
  const fetchCalendarMoments = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setCalendarLoading(true);

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
      .eq("user_id", userId)
      .order("moment_date", { ascending: false, nullsFirst: false });
    if (userIdRef.current !== userId) return;
    if (!error && data) {
      setCalendarMoments(
        data.map((r: any): CalendarMoment => ({
          id: r.id,
          momentDate: r.moment_date ?? null,
          songArtworkUrl: r.song_artwork_url ?? "",
          songTitle: r.song_title ?? "",
          songArtist: r.song_artist ?? "",
        }))
      );
      calendarFetchedRef.current = true;
    } else {
      calendarFetchedRef.current = false;
    }
    setCalendarLoading(false);
  }, [userId]);

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

  // Sets the rendered list and keeps the snapshot (used by the calendar and
  // the focus-time prepend/delete) in step with it, every page included.
  // The calendar derives from that snapshot (or its own query), so any change
  // here makes it out of date: it refetches on its next open, or now if it's
  // the visible view. It used to keep its first snapshot until a pull.
  const applyList = useCallback((list: Moment[], nextHasMore: boolean) => {
    momentsRef.current = list;
    timelineSnapshotRef.current = { moments: list, hasMore: nextHasMore };
    setMoments(list);
    setHasMore(nextHasMore);
    calendarFetchedRef.current = null;
    if (viewModeRef.current === "calendar") fetchCalendarMoments(true);
  }, [fetchCalendarMoments]);

  // The first page to disk, so the next launch paints what's on screen now.
  // `generation` is from when the data was fetched; see writeTimelineCache.
  const persistFirstPage = useCallback(
    (list: Moment[], generation?: number) => {
      if (!userId || userIdRef.current !== userId) return;
      writeTimelineCache(userId, list, generation);
    },
    [userId]
  );

  const mergeFresh = useCallback((fresh: Moment[]) => {
    const merged = mergeFirstPage(momentsRef.current, fresh, hasMoreRef.current);
    pageRef.current = lastLoadedPage(merged.moments.length);
    applyList(merged.moments, merged.hasMore);
  }, [applyList]);

  const fetchMomentsInner = useCallback(
    async (showLoading: boolean, append = false, skipPrefetch = false) => {
      if (!userId) return;
      if (!append) {
        pageRef.current = 0;
        refreshInFlightRef.current = true;
      }
      if (showLoading) setLoading(true);
      const t0 = Date.now();

      if (skipPrefetch) discardTimelinePrefetch(userId);
      if (showLoading && !append && !skipPrefetch) {
        const prefetchPromise = consumePrefetchPromise(userId);
        if (prefetchPromise) {
          const prefetched = await prefetchPromise.catch(() => null);
          if (prefetched !== null && userIdRef.current === userId) {
            applyList(prefetched, prefetched.length === TIMELINE_PAGE_SIZE);
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
            // It can land after the user has already paged further (slow
            // network), so it's merged as a first page rather than replacing
            // the list, which used to drop the appended pages.
            const networkPromise = consumePrefetchNetworkPromise(userId);
            if (networkPromise) {
              networkPromise
                .then((fresh) => {
                  if (userIdRef.current !== userId) return; // signed out meanwhile
                  if (fresh === null) {
                    // Offline or failed: the list is last launch's cache. Say
                    // so, retry once shortly, and let the next focus or
                    // foreground refresh regardless of the cooldown.
                    needsRefreshRef.current = true;
                    setBannerError("Couldn't refresh. Showing your saved moments.");
                    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = setTimeout(() => {
                      retryTimerRef.current = null;
                      if (needsRefreshRef.current && userIdRef.current === userId) {
                        fetchMomentsRef.current(false);
                      }
                    }, NETWORK_RETRY_MS);
                    return;
                  }
                  mergeFresh(fresh); // the prefetch wrote this page to disk itself
                })
                .catch(() => {});
            }
            return;
          }
        }
      }
      setBannerError("");
      if (showLoading) setError("");

      // After the prefetch was consumed or discarded, so its own cache write
      // doesn't count as superseding this one.
      const cacheGeneration = getTimelineCacheGeneration();
      const from = pageRef.current * TIMELINE_PAGE_SIZE;
      const { data, error: fetchError } = await supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS)
        .eq("user_id", userId)
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
        // A failed background refresh keeps the list it had, so paging
        // continues from what's loaded rather than from page 0.
        if (!append) pageRef.current = lastLoadedPage(momentsRef.current.length);
        setLoading(false);
        return;
      }

      if (userIdRef.current !== userId) return; // signed out meanwhile

      const mapped: Moment[] = (data ?? []).map(mapRowToMoment);

      if (append) {
        applyList(appendPage(momentsRef.current, mapped), mapped.length === TIMELINE_PAGE_SIZE);
      } else if (showLoading) {
        applyList(mapped, mapped.length === TIMELINE_PAGE_SIZE);
      } else {
        // Background refresh (focus, pull-to-refresh, retry): refetch page 0
        // and merge it, keeping the pages the user has scrolled through.
        mergeFresh(mapped);
      }
      if (!append) {
        persistFirstPage(momentsRef.current, cacheGeneration);
        needsRefreshRef.current = false;
      }
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
    },
    // The retry calls fetchMoments through a ref: it wraps this function.
    [userId, posthog, applyList, mergeFresh, persistFirstPage]
  );

  const fetchMoments = useCallback(
    async (showLoading: boolean, append = false, skipPrefetch = false) => {
      try {
        await fetchMomentsInner(showLoading, append, skipPrefetch);
      } finally {
        if (!append) refreshInFlightRef.current = false;
      }
    },
    [fetchMomentsInner]
  );
  const fetchMomentsRef = useRef(fetchMoments);
  fetchMomentsRef.current = fetchMoments;

  const handleLoadMore = useCallback(async () => {
    // Don't append while a refresh is resetting pageRef — the two racing would
    // leave pageRef out of sync with what's rendered and skip a page.
    if (!hasMore || loadingMore || refreshInFlightRef.current) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchMoments(false, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchMoments]);

  // Back from the background: the tab never lost focus, so the effect below
  // doesn't run. Without this the Journal showed whatever it had when the app
  // was backgrounded, hours old, until a pull-to-refresh. The calendar follows
  // via applyList when the refresh lands.
  useOnForeground(() => {
    if (!userId) return;
    if (
      shouldRefreshOnResume(lastFetchTime.current, Date.now(), REFETCH_COOLDOWN_MS, needsRefreshRef.current)
    ) {
      fetchMoments(false);
    }
    if (Date.now() - unviewedUpdatedAtRef.current >= SHARED_BADGE_STALE_MS) refetchUnviewed();
  });

  useFocusEffect(
    useCallback(() => {
      const { stale, pendingMoment, deletedMomentId } = consumeTimelineStale();
      const elapsed = Date.now() - lastFetchTime.current;

      // Applied before the refresh below lands, so the change shows at once.
      // Only once something is loaded; otherwise the first fetch brings it.
      const applyNow = !!timelineSnapshotRef.current && !!(pendingMoment || deletedMomentId);
      if (applyNow) {
        let list = momentsRef.current;
        // In its timeline position, deduped by id (insertPendingMoment).
        if (pendingMoment) list = insertPendingMoment(list, pendingMoment, hasMoreRef.current);
        if (deletedMomentId) list = list.filter((m) => m.id !== deletedMomentId);
        applyList(list, hasMoreRef.current);
        persistFirstPage(list);
      }

      if (stale) calendarFetchedRef.current = null;
      // applyList above already refreshed a visible calendar.
      if (!applyNow && viewModeRef.current === "calendar" && calendarFetchedRef.current !== true) {
        fetchCalendarMoments();
      }
      const plan = planFocusFetch({
        hasFetched: lastFetchTime.current !== 0,
        stale: stale || needsRefreshRef.current,
        elapsedMs: elapsed,
        cooldownMs: REFETCH_COOLDOWN_MS,
      });
      if (plan === "initial") fetchMoments(true);
      else if (plan === "initial_fresh") fetchMoments(true, false, true);
      else if (plan === "refresh") fetchMoments(false);

      // The "new from friends" row's count, on the badge cooldown.
      if (userId && Date.now() - unviewedUpdatedAtRef.current >= SHARED_BADGE_STALE_MS) refetchUnviewed();
    }, [fetchMoments, fetchCalendarMoments, userId, refetchUnviewed, applyList, persistFirstPage])
  );

  // The calendar is refreshed by applyList once the new list lands: fetching
  // it alongside used the snapshot from before the refresh.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchMoments(false), refetchUnviewed()]);
    setRefreshing(false);
  }, [fetchMoments, refetchUnviewed]);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  // In-place removal for long-press delete: the stale signal set by
  // deleteMomentWithCleanup only takes effect on the next focus, and deleting
  // from the card never leaves the screen.
  const handleCardDeleted = useCallback((deletedId: string) => {
    const list = momentsRef.current.filter((m) => m.id !== deletedId);
    applyList(list, hasMoreRef.current);
    persistFirstPage(list);
    setCalendarMoments((prev) => prev.filter((m) => m.id !== deletedId));
  }, [applyList, persistFirstPage]);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard item={item} allMoods={allMoods} onDeleted={handleCardDeleted} currentUserId={userId} />
  ), [allMoods, handleCardDeleted, userId]);

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
      {userId ? <DailyCheckInOffer userId={userId} hasMoments={moments.length > 0} /> : null}
    </>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        leading="none"
        title="Journal"
        right={
          <>
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
          </>
        }
        style={styles.header}
      />

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
                // Scrollable so pull-to-refresh works here too: an empty list
                // that turned out to be wrong had no way to recover.
                <ScrollView
                  contentContainerStyle={styles.emptyScroll}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={theme.colors.text}
                    />
                  }
                >
                  <View style={styles.emptyHeader}>{listHeader}</View>
                  <EmptyState
                    icon="musical-notes-outline"
                    title="No moments yet"
                    subtitle={"A moment is a song paired with a memory —\nwhat you felt, who you were with, and why it mattered."}
                    action={{ label: "Create Your First Moment", onPress: () => router.push("/create") }}
                  />
                </ScrollView>
              ) : (
                <SectionList
                  ref={sectionListRef}
                  sections={sections}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMoment}
                  renderSectionHeader={({ section: { title } }) => (
                    // "November 2026", in Label and its own case (DESIGN.md).
                    <SectionLabel style={styles.sectionHeader}>{title}</SectionLabel>
                  )}
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
                        color={theme.colors.textSecondary}
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
      paddingBottom: theme.spacing.xs,
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
    // Segment lift (DESIGN.md, Shadow Vocabulary): a faint ink shadow on
    // paper, none on night, where the darker fill carries the step.
    segmentActive: {
      backgroundColor: theme.colors.background,
      shadowColor: theme.colors.text,
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
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot
    },
    sharedRowText: {
      ...theme.typography.callout,
      flex: 1,
      color: theme.colors.text,
    },
    viewsContainer: {
      flex: 1,
    },
    skeletonList: {
      paddingHorizontal: theme.spacing.xl,
    },
    sectionHeader: {
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.xs,
    },
    emptyScroll: {
      flexGrow: 1,
      paddingBottom: 110,
    },
    emptyHeader: {
      paddingHorizontal: theme.spacing.xl,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      // Clears the floating capture button so the last entry is never under it.
      paddingBottom: 110,
    },
  });
}
