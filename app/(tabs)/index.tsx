import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { consumeTimelineStale } from "@/lib/timelineRefresh";
import { consumePrefetchPromise, TIMELINE_PAGE_SIZE } from "@/lib/timelinePrefetch";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { MomentCard } from "@/components/MomentCard";
import { IconButton } from "@/components/IconButton";
import { CalendarView } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { fetchTaggedMomentsSharedTab, markAllTaggedMomentsViewed } from "@/lib/friends";
import { fetchBrowseMetadata, BrowseMeta } from "@/lib/browse";
import { Moment } from "@/types";

const REFETCH_COOLDOWN_MS = 30_000;

function deriveOnThisDay(meta: BrowseMeta[]) {
  const today = new Date();
  const m = today.getMonth();
  const d = today.getDate();
  const y = today.getFullYear();
  return meta.filter((item) => {
    if (!item.momentDate) return false;
    const date = new Date(item.momentDate + "T00:00:00");
    return date.getMonth() === m && date.getDate() === d && date.getFullYear() < y;
  });
}

function yearsAgo(dateStr: string): string {
  const diff = new Date().getFullYear() - new Date(dateStr + "T00:00:00").getFullYear();
  return diff === 1 ? "1 year ago" : `${diff} years ago`;
}

function OnThisDayStrip({ items, onPress }: { items: BrowseMeta[]; onPress: (id: string) => void }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{
        fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.2,
        color: theme.colors.textTertiary, paddingHorizontal: 20, marginBottom: 8, marginTop: 12,
      }}>
        ON THIS DAY
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingLeft: 12, paddingRight: 20 }}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPress(item.id)}
            activeOpacity={0.85}
            style={{ marginRight: 10, width: 180 }}
          >
            <LinearGradient
              colors={["#E8825C", "#6B5F8C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 12, height: 96, overflow: "hidden" }}
            >
              {item.songArtworkUrl ? (
                <Image
                  source={{ uri: item.songArtworkUrl }}
                  style={{ ...StyleSheet.absoluteFillObject, opacity: 0.35 }}
                  contentFit="cover"
                />
              ) : null}
              <View style={{ flex: 1, padding: 12, justifyContent: "flex-end" }}>
                <Text style={{ fontSize: 13, fontFamily: "DMSans_600SemiBold", color: "#fff" }} numberOfLines={1}>
                  {item.songTitle}
                </Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }} numberOfLines={1}>
                  {item.songArtist}
                </Text>
                {item.momentDate ? (
                  <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4, fontFamily: "DMSans_400Regular" }}>
                    {yearsAgo(item.momentDate)}
                  </Text>
                ) : null}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

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
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Toggle between personal timeline and tagged moments
  const [activeTab, setActiveTab] = useState<"mine" | "tagged">("mine");

  // Snapshot of the full timeline so calendar can derive data without another query
  const timelineSnapshotRef = useRef<{ moments: Moment[]; hasMore: boolean } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMoments, setCalendarMoments] = useState<Moment[]>([]);
  const calendarFetchedRef = useRef<null | boolean>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

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

  const mineOpacity = useSharedValue(1);
  const taggedOpacity = useSharedValue(0);
  const mineAnimStyle = useAnimatedStyle(() => ({ opacity: mineOpacity.value }));
  const taggedAnimStyle = useAnimatedStyle(() => ({ opacity: taggedOpacity.value }));

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

  const fetchMoments = useCallback(
    async (showLoading: boolean, append = false) => {
      if (!user) return;
      if (!append) pageRef.current = 0;
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

  useFocusEffect(
    useCallback(() => {
      const { stale, pendingMoment, deletedMomentId } = consumeTimelineStale();
      const elapsed = Date.now() - lastFetchTime.current;

      if (pendingMoment && timelineSnapshotRef.current) {
        const updated = [pendingMoment, ...timelineSnapshotRef.current.moments];
        timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        setMoments(updated);
        setTotalCount((prev) => (prev !== null ? prev + 1 : null));
      }

      if (deletedMomentId) {
        const filter = (list: Moment[]) => list.filter((m) => m.id !== deletedMomentId);
        if (timelineSnapshotRef.current) {
          const updated = filter(timelineSnapshotRef.current.moments);
          timelineSnapshotRef.current = { ...timelineSnapshotRef.current, moments: updated };
        }
        setMoments((prev) => prev.filter((m) => m.id !== deletedMomentId));
        setTotalCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      }

      if (stale) calendarFetchedRef.current = null;
      if (viewModeRef.current === "calendar" && calendarFetchedRef.current !== true) fetchCalendarMoments();
      if (lastFetchTime.current === 0) {
        fetchMoments(true);
      } else if (stale || elapsed >= REFETCH_COOLDOWN_MS) {
        fetchMoments(false);
      }
    }, [fetchMoments, fetchCalendarMoments])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    calendarFetchedRef.current = null;
    await Promise.all([fetchMoments(false), fetchCalendarMoments()]);
    setRefreshing(false);
  }, [fetchMoments, fetchCalendarMoments]);

  const queryClient = useQueryClient();

  // Tagged moments query — always enabled so data is ready before the user switches
  const { data: taggedMoments = [], isFetching: taggedFetching, isLoading: taggedLoading, refetch: refetchTagged } = useQuery({
    queryKey: ["taggedMoments", user?.id],
    queryFn: () => fetchTaggedMomentsSharedTab(user!.id),
    staleTime: 2 * 60 * 1000,
    enabled: !!user,
  });

  // Browse metadata — already prefetched app-wide; used here for On This Day strip
  const { data: browseMeta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
  const onThisDayItems = useMemo(() => deriveOnThisDay(browseMeta), [browseMeta]);

  useEffect(() => {
    if (activeTab === "tagged" && taggedMoments.length > 0 && user) {
      markAllTaggedMomentsViewed(user.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["profileBadge", user.id] });
      });
    }
  }, [activeTab, user?.id, queryClient]);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard item={item} allMoods={allMoods} />
  ), [allMoods]);

  const listHeader = (
    <>
      {onThisDayItems.length > 0 && (
        <OnThisDayStrip
          items={onThisDayItems}
          onPress={(id) => router.push({ pathname: "/moment/[id]", params: { id } })}
        />
      )}
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
          <View style={{ flex: 1, marginRight: theme.spacing.md }}>
            {totalCount !== null && activeTab === "mine" && (
              <Text style={styles.momentCountLabel}>
                {totalCount} {totalCount === 1 ? "MOMENT" : "MOMENTS"}
              </Text>
            )}
            <Text style={styles.title}>your soundtrack</Text>
          </View>
          <View style={styles.headerRight}>
            <IconButton
              name="search-outline"
              onPress={() => router.push("/browse" as any)}
            />
            {activeTab === "mine" && (
              <IconButton
                name={viewMode === "calendar" ? "list-outline" : "calendar-outline"}
                onPress={toggleView}
              />
            )}
          </View>
        </View>

        {/* My Moments / Tagged toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.togglePill, activeTab === "mine" && styles.togglePillActive]}
            onPress={() => {
              setActiveTab("mine");
              taggedOpacity.value = withTiming(0, { duration: 180 });
              mineOpacity.value = withTiming(1, { duration: 180 });
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, activeTab === "mine" && styles.toggleTextActive]}>
              My Moments
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.togglePill, activeTab === "tagged" && styles.togglePillActive]}
            onPress={() => {
              setActiveTab("tagged");
              mineOpacity.value = withTiming(0, { duration: 180 });
              taggedOpacity.value = withTiming(1, { duration: 180 });
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, activeTab === "tagged" && styles.toggleTextActive]}>
              Tagged
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* My Moments + Tagged — both always mounted; opacity + pointerEvents controls visibility */}
      <View style={{ flex: 1 }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, mineAnimStyle]}
          pointerEvents={activeTab === "mine" ? "auto" : "none"}
        >
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
        </Animated.View>

        <Animated.View
          style={[StyleSheet.absoluteFill, taggedAnimStyle]}
          pointerEvents={activeTab === "tagged" ? "auto" : "none"}
        >
          <FlatList
            data={taggedMoments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, !taggedLoading && taggedMoments.length === 0 && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={taggedFetching && !taggedLoading}
                onRefresh={() => refetchTagged()}
                tintColor={theme.colors.text}
              />
            }
            renderItem={({ item }) =>
              item.moment ? <MomentCard item={item.moment} allMoods={allMoods} /> : null
            }
            ListEmptyComponent={
              taggedLoading ? (
                <View style={styles.skeletonList}>
                  {[0, 1, 2, 3].map((i) => <SkeletonTimelineCard key={i} />)}
                </View>
              ) : (
                <EmptyState
                  icon="person-add-outline"
                  title="No tagged moments yet"
                  subtitle="When a friend tags you in a memory, it'll appear here."
                />
              )
            }
          />
        </Animated.View>
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
      paddingTop: 60,
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
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
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    toggle: {
      flexDirection: "row",
      gap: 6,
      paddingBottom: theme.spacing.sm,
    },
    togglePill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: theme.radii.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    togglePillActive: {
      backgroundColor: theme.colors.buttonBg,
      borderColor: theme.colors.buttonBg,
    },
    toggleText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textSecondary,
    },
    toggleTextActive: {
      color: theme.colors.buttonText,
    },
    viewsContainer: {
      flex: 1,
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
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 14 + 46 + 12,
    },
  });
}
