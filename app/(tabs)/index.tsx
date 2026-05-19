import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { fetchCollections, fetchSharedCollectionMoments, readCollectionsCache, writeCollectionsCache, readCollectionMomentsCache, writeCollectionMomentsCache, COLLECTION_MOMENTS_TTL_MS } from "@/lib/collections";
import { consumePendingCollectionId } from "@/lib/pendingCollection";
import { consumeTimelineStale } from "@/lib/timelineRefresh";
import { consumePrefetchPromise, TIMELINE_PAGE_SIZE } from "@/lib/timelinePrefetch";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";
import { CalendarView } from "@/components/CalendarView";
import { CollectionPicker } from "@/components/CollectionPicker";
import { CreateCollectionModal } from "@/components/CreateCollectionModal";
import { CollectionShareSheet } from "@/components/CollectionShareSheet";
import { Collection, Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 30_000;

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

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [createCollectionVisible, setCreateCollectionVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const selectedCollectionRef = useRef(selectedCollection);
  selectedCollectionRef.current = selectedCollection;

  // Snapshot of the full timeline (all-moments view) so we can restore instantly
  // when switching from a collection filter back to "All" without a loading flash.
  const timelineSnapshotRef = useRef<{ moments: Moment[]; hasMore: boolean } | null>(null);

  // Per-collection moment cache: collectionId → { moments, fetchedAt }
  // Makes switching between chips feel instant after the first load.
  const collectionCacheRef = useRef<Map<string, { moments: Moment[]; fetchedAt: number }>>(new Map());

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMoments, setCalendarMoments] = useState<Moment[]>([]);
  // null = never attempted, true = succeeded, false = failed (don't auto-retry, but retry on explicit user action)
  const calendarFetchedRef = useRef<null | boolean>(null);
  const lastCollectionsFetchTime = useRef(0);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Clear all data immediately when the user changes (e.g. sign out → sign in as different user)
  useEffect(() => {
    setMoments([]);
    setCalendarMoments([]);
    setCollections([]);
    setSelectedCollection(null);
    calendarFetchedRef.current = null;
    lastFetchTime.current = 0;
    lastCollectionsFetchTime.current = 0;
    timelineSnapshotRef.current = null;
    collectionCacheRef.current.clear();
  }, [user?.id]);
  const sectionListRef = useRef<SectionList>(null);

  const listOpacity = useSharedValue(1);
  const calendarOpacity = useSharedValue(0);
  const listAnimStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const calendarAnimStyle = useAnimatedStyle(() => ({ opacity: calendarOpacity.value }));

  // Stable ref so pinch worklet always reads current viewMode
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const fetchCalendarMoments = useCallback(async () => {
    if (!user) return;
    setCalendarLoading(true);

    // If all moments are already in memory, derive calendar data from them — no query needed.
    const snapshot = timelineSnapshotRef.current;
    if (snapshot && !snapshot.hasMore) {
      setCalendarMoments(snapshot.moments);
      calendarFetchedRef.current = true;
      setCalendarLoading(false);
      return;
    }

    // Paginated user (30+ moments) — must query the full set.
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
          mood: null, people: [], location: null, timeOfDay: null,
          createdAt: "", updatedAt: "", songAlbumName: "", songAppleMusicId: "",
          songPreviewUrl: null, visibility: "private",
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

  // Tapping the Moments tab while already on it switches back to list view
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

  // Scroll to a specific moment after switching from calendar to list
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

  const fetchMoments = useCallback(
    async (showLoading: boolean, append = false) => {
      if (!user) return;
      if (!append) pageRef.current = 0;
      if (showLoading) setLoading(true);
      const t0 = Date.now();

      // On first load, consume the prefetch started at auth — avoids a duplicate
      // round trip and makes the initial render feel instant
      if (showLoading && !append) {
        const prefetchPromise = consumePrefetchPromise(user.id);
        if (prefetchPromise) {
          const prefetched = await prefetchPromise.catch(() => null);
          if (prefetched !== null) {
            const nextHasMore = prefetched.length === TIMELINE_PAGE_SIZE;
            setMoments(prefetched);
            setHasMore(nextHasMore);
            timelineSnapshotRef.current = { moments: prefetched, hasMore: nextHasMore };
            // Derive count from cache; only hit the DB if there might be more pages
            if (!nextHasMore) {
              setTotalCount(prefetched.length);
            } else {
              Promise.resolve(
                supabase.from("moments").select("id", { count: "exact", head: true }).eq("user_id", user.id)
              ).then(({ count }) => { if (count !== null) setTotalCount(count); }).catch(() => {});
            }
            setLoading(false);
            lastFetchTime.current = Date.now();
            posthog?.capture("timeline_load", {
              source: "cold_start",
              served_from: "prefetch_cache",
              duration_ms: Date.now() - t0,
              moment_count: prefetched.length,
            });
            return;
          }
        }
      }
      setBannerError("");
      if (showLoading) setError("");

      const currentCollection = selectedCollectionRef.current;
      const filtersActive = currentCollection !== null;

      let query = supabase
        .from("moments")
        .select("*")
        .eq("user_id", user!.id)
        .order("moment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (currentCollection) {
        const cacheKey = currentCollection.id;
        const collectionType = currentCollection.isPublic ? "shared" : "personal";

        // L1: in-memory cache (fast, within-session)
        let memCached = collectionCacheRef.current.get(cacheKey);

        // L2: AsyncStorage (survives app restarts) — only check on cache miss
        if (!memCached && user) {
          const persisted = await readCollectionMomentsCache(user.id, cacheKey);
          if (persisted) {
            memCached = persisted;
            collectionCacheRef.current.set(cacheKey, persisted); // warm L1
          }
        }

        const cacheStale = !memCached || (Date.now() - memCached.fetchedAt) > COLLECTION_MOMENTS_TTL_MS;

        // Show cached content immediately regardless of staleness
        if (memCached) {
          setMoments(memCached.moments);
          setHasMore(false);
          setLoading(false);
          if (!cacheStale) {
            lastFetchTime.current = Date.now();
            posthog?.capture("collection_switch", {
              served_from: "cache",
              collection_type: collectionType,
              duration_ms: Date.now() - t0,
              moment_count: memCached.moments.length,
            });
            return;
          }
          // Stale: show cached content but fall through to refresh
        }

        const fetchAndCache = async (): Promise<Moment[]> => {
          if (currentCollection.isPublic) {
            return fetchSharedCollectionMoments(currentCollection.id);
          }
          // Personal collection: filter the in-memory snapshot if we have all moments,
          // avoiding a DB round-trip entirely. Fall back to a query only for paginated users.
          const snapshot = timelineSnapshotRef.current;
          const ids = currentCollection.momentIds;
          if (snapshot && !snapshot.hasMore && ids) {
            const idSet = new Set(ids);
            return snapshot.moments
              .filter((m) => idSet.has(m.id))
              .sort((a, b) => {
                const da = a.momentDate ?? a.createdAt;
                const db = b.momentDate ?? b.createdAt;
                return da < db ? 1 : da > db ? -1 : 0;
              });
          }
          const { data: collectionMoments, error: cmError } = await supabase
            .from("moments")
            .select("*, collection_moments!inner(collection_id)")
            .eq("user_id", user!.id)
            .eq("collection_moments.collection_id", currentCollection.id)
            .order("moment_date", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false });
          if (cmError) throw cmError;
          return (collectionMoments ?? []).map(mapRowToMoment);
        };

        const fresh = await fetchAndCache();
        const entry = { moments: fresh, fetchedAt: Date.now() };
        collectionCacheRef.current.set(cacheKey, entry);
        if (user) writeCollectionMomentsCache(user.id, cacheKey, fresh);
        setMoments(fresh);
        setHasMore(false);
        setLoading(false);
        lastFetchTime.current = Date.now();
        posthog?.capture("collection_switch", {
          served_from: memCached ? "stale_cache_refresh" : "network",
          collection_type: collectionType,
          duration_ms: Date.now() - t0,
          moment_count: fresh.length,
        });
        return;
      }

      // When switching back to All: restore cached snapshot instantly so the
      // user sees content immediately while the fresh fetch runs in background.
      if (!currentCollection && !append && timelineSnapshotRef.current) {
        setMoments(timelineSnapshotRef.current.moments);
        setHasMore(timelineSnapshotRef.current.hasMore);
        setLoading(false);
        // Don't return — continue the fetch so we silently refresh the data.
      }

      // Paginate only on the unfiltered "All Moments" view
      if (!filtersActive) {
        const from = pageRef.current * TIMELINE_PAGE_SIZE;
        query = query.range(from, from + TIMELINE_PAGE_SIZE - 1);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        if (showLoading) {
          setError(friendlyError(fetchError));
        } else {
          setBannerError(friendlyError(fetchError));
        }
        setLoading(false);
        return;
      }

      const mapped: Moment[] = (data ?? []).map(mapRowToMoment);

      if (append) {
        setMoments((prev) => [...prev, ...mapped]);
      } else {
        setMoments(mapped);
      }
      const nextHasMore = !filtersActive && mapped.length === TIMELINE_PAGE_SIZE;
      setHasMore(nextHasMore);
      setLoading(false);
      lastFetchTime.current = Date.now();

      if (!append) {
        posthog?.capture("timeline_load", {
          source: showLoading ? "cold_start" : "background_refresh",
          served_from: "network",
          duration_ms: Date.now() - t0,
          moment_count: mapped.length,
          has_filters: filtersActive,
        });
      }

      // Keep snapshot fresh whenever showing the unfiltered timeline.
      if (!filtersActive && !append) {
        timelineSnapshotRef.current = { moments: mapped, hasMore: nextHasMore };
        // Derive total count from loaded rows when we have everything; fire a
        // COUNT query only for paginated users (nextHasMore === true) who need
        // the real number before they've scrolled to the last page.
        if (!nextHasMore) {
          setTotalCount(mapped.length);
        } else {
          Promise.resolve(
            supabase
              .from("moments")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user!.id)
          ).then(({ count }) => { if (count !== null) setTotalCount(count); }).catch(() => {});
        }
      }

    },
    [user, posthog]
  );

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchMoments(false, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, fetchMoments]);

  const loadCollections = useCallback(async () => {
    if (!user) return;
    try {
      // Show cached collections immediately while fetching fresh data
      const cached = await readCollectionsCache(user.id);
      if (cached) setCollections(cached);
      const data = await fetchCollections(user.id);
      setCollections(data);
      writeCollectionsCache(user.id, data);
      lastCollectionsFetchTime.current = Date.now();
    } catch {}
  }, [user]);

  // Auto-select a collection after joining via invite link
  useEffect(() => {
    if (collections.length === 0) return;
    const pendingId = consumePendingCollectionId();
    if (pendingId) {
      const col = collections.find((c) => c.id === pendingId);
      if (col) setSelectedCollection(col);
    }
  }, [collections]);

  // Re-fetch when collection changes
  useEffect(() => {
    if (lastFetchTime.current > 0) {
      fetchMoments(false);
    }
  }, [selectedCollection, fetchMoments]);

  useFocusEffect(
    useCallback(() => {
      const { stale, pendingMoment, deletedMomentId } = consumeTimelineStale();
      const elapsed = Date.now() - lastFetchTime.current;
      const collectionsElapsed = Date.now() - lastCollectionsFetchTime.current;

      // Optimistically prepend a newly created moment so it appears instantly.
      if (pendingMoment && timelineSnapshotRef.current && !selectedCollectionRef.current) {
        const updated = [pendingMoment, ...timelineSnapshotRef.current.moments];
        timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        setMoments(updated);
        setTotalCount((prev) => (prev !== null ? prev + 1 : null));
      }

      // Optimistically remove a deleted moment so the timeline updates instantly.
      if (deletedMomentId) {
        const filter = (list: Moment[]) => list.filter((m) => m.id !== deletedMomentId);
        if (timelineSnapshotRef.current) {
          const updated = filter(timelineSnapshotRef.current.moments);
          timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        }
        setMoments((prev) => prev.filter((m) => m.id !== deletedMomentId));
        setTotalCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      }

      if (stale || collectionsElapsed >= REFETCH_COOLDOWN_MS) loadCollections();

      if (stale) calendarFetchedRef.current = null;
      if (viewModeRef.current === "calendar" && calendarFetchedRef.current !== true) fetchCalendarMoments();
      if (lastFetchTime.current === 0) {
        fetchMoments(true);
      } else if (stale || elapsed >= REFETCH_COOLDOWN_MS) {
        fetchMoments(false);
      }
    }, [fetchMoments, loadCollections, fetchCalendarMoments])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    calendarFetchedRef.current = null;
    lastCollectionsFetchTime.current = 0;
    await Promise.all([fetchMoments(false), loadCollections(), fetchCalendarMoments()]);
    setRefreshing(false);
  }, [fetchMoments, loadCollections, fetchCalendarMoments]);


  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const personalCollections = useMemo(
    () => collections.filter((c) => c.role === "owner" && !c.isPublic),
    [collections]
  );

  const displayCount = selectedCollection
    ? selectedCollection.momentCount
    : totalCount;

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      collectionId={selectedCollection?.id}
      collectionRole={selectedCollection?.role}
    />
  ), [allMoods, selectedCollection]);

  const handleRequestCreate = useCallback(() => {
    setPickerVisible(false);
    setCreateCollectionVisible(true);
  }, []);

  const handleCollectionCreated = useCallback((collection: Collection) => {
    setCollections((prev) => [...prev, collection]);
    setSelectedCollection(collection);
    setCreateCollectionVisible(false);
  }, []);

  const handleCollectionUpdated = useCallback((updated: Collection) => {
    setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCollection(updated);
  }, []);

  const handleCollectionLeft = useCallback((collectionId: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    setSelectedCollection(null);
  }, []);

  const listHeader = bannerError ? (
    <ErrorBanner
      message={bannerError}
      onRetry={() => fetchMoments(false)}
      onDismiss={() => setBannerError("")}
    />
  ) : null;

  const showEmptyCollectionState = selectedCollection !== null && moments.length === 0 && !loading && !error;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Title row */}
        <View style={styles.headerTop}>
          <View style={{ flex: 1, marginRight: theme.spacing.md }}>
            {displayCount !== null && (
              <Text style={styles.momentCountLabel}>
                {displayCount} {displayCount === 1 ? "MOMENT" : "MOMENTS"}
              </Text>
            )}
            <Text style={styles.title}>your soundtrack</Text>
          </View>
          <View style={styles.headerRight}>
            {selectedCollection ? (
              <TouchableOpacity onPress={() => setShareSheetVisible(true)} hitSlop={8}>
                <Ionicons
                  name={selectedCollection.role === "owner" ? "settings-outline" : "ellipsis-horizontal"}
                  size={22}
                  color={theme.colors.text}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={toggleView} hitSlop={8}>
              <Ionicons
                name={viewMode === "calendar" ? "list-outline" : "calendar-outline"}
                size={22}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Collection chip row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
          style={styles.chipRow}
        >
          {/* All chip */}
          <TouchableOpacity
            style={[styles.chip, !selectedCollection && styles.chipSelected]}
            onPress={() => setSelectedCollection(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, !selectedCollection && styles.chipTextSelected]}>
              All
            </Text>
          </TouchableOpacity>

          {/* Personal collection chips */}
          {personalCollections.map((col) => {
            const isSelected = selectedCollection?.id === col.id;
            return (
              <TouchableOpacity
                key={col.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => setSelectedCollection(isSelected ? null : col)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} numberOfLines={1}>
                  {col.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* If selected collection is shared (not in chip row), show it as a chip */}
          {selectedCollection && !personalCollections.find((c) => c.id === selectedCollection.id) && (
            <TouchableOpacity
              style={[styles.chip, styles.chipSelected, styles.chipShared]}
              onPress={() => setSelectedCollection(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={11} color={theme.colors.accentSecondary} />
              <Text style={[styles.chipText, { color: theme.colors.accentSecondary }]} numberOfLines={1}>
                {selectedCollection.name}
              </Text>
              <Ionicons name="close" size={11} color={theme.colors.accentSecondary} />
            </TouchableOpacity>
          )}

          {/* Overflow chip */}
          <TouchableOpacity
            style={styles.chip}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>•••</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>


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
            <View style={styles.centered}>
              <View style={styles.emptyIconContainer}>
                <Ionicons
                  name="musical-notes"
                  size={40}
                  color={theme.colors.textTertiary}
                />
              </View>
              <Text style={styles.emptyTitle}>No moments yet</Text>
              <Text style={styles.emptySubtitle}>
                A moment is a song paired with a memory —{"\n"}what you felt, who
                you were with, and why it mattered.
              </Text>
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => router.push("/create")}
                activeOpacity={0.7}
              >
                <Text style={styles.ctaButtonText}>Create Your First Moment</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SectionList
              ref={sectionListRef}
              sections={sections}
              keyExtractor={(item) => item.id}
              renderItem={renderMoment}
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.sectionHeader}>{title}</Text>
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
              ListEmptyComponent={
                showEmptyCollectionState ? (
                  <View style={styles.centered}>
                    <Text style={styles.emptySubtitle}>
                      No moments in "{selectedCollection?.name}"
                    </Text>
                  </View>
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

      <CollectionPicker
        visible={pickerVisible}
        collections={collections}
        selectedId={selectedCollection?.id ?? null}
        onSelect={(c) => setSelectedCollection(c)}
        onClose={() => setPickerVisible(false)}
        onRequestCreate={handleRequestCreate}
      />

      {user ? (
        <CreateCollectionModal
          visible={createCollectionVisible}
          userId={user.id}
          onCreated={handleCollectionCreated}
          onClose={() => setCreateCollectionVisible(false)}
        />
      ) : null}

      {selectedCollection && shareSheetVisible ? (
        <CollectionShareSheet
          visible={shareSheetVisible}
          collection={selectedCollection}
          onClose={() => setShareSheetVisible(false)}
          onUpdated={handleCollectionUpdated}
          onLeft={handleCollectionLeft}
        />
      ) : null}

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
      paddingTop: 60,
      paddingBottom: theme.spacing.sm,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    momentCountLabel: {
      fontSize: 11,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 0.8,
      color: theme.colors.textTertiary,
      marginBottom: 2,
    },
    title: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      lineHeight: 34,
    },
    chipRow: {
      marginHorizontal: -theme.spacing.xl,
    },
    chipRowContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 8,
      paddingBottom: theme.spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radii.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: "transparent",
    },
    chipSelected: {
      backgroundColor: theme.colors.buttonBg,
      borderColor: theme.colors.buttonBg,
    },
    chipShared: {
      backgroundColor: theme.colors.accentSecondaryBg,
      borderColor: theme.colors.accentSecondary,
    },
    chipText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textSecondary,
    },
    chipTextSelected: {
      color: theme.colors.buttonText,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    viewsContainer: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.backgroundTertiary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.xl,
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptySubtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    ctaButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["2xl"] + 4,
      borderRadius: theme.radii.md,
      marginTop: theme.spacing.xl,
    },
    ctaButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    skeletonList: {
      paddingHorizontal: theme.spacing.xl,
    },
    sectionHeader: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.md,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["4xl"],
    },
  });
}
