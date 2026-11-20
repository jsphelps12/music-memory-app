import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  AccessibilityInfo,
  Alert,
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { consumeTimelineStale, planFocusFetch } from "@/lib/timelineRefresh";
import { shouldRefreshOnResume, useOnForeground, useOnReconnect } from "@/lib/appFocus";
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
import { fetchAllRows } from "@/lib/fetchAllRows";
import { groupMomentsByMonth } from "@/lib/monthGroups";
import { fetchUnviewedSharedCount } from "@/lib/momentShares";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonTimelineCard } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";
import { MomentCard, type CardMenuAction } from "@/components/MomentCard";
import { MomentShareHost } from "@/components/MomentShareHost";
import { MomentAlbumSheet } from "@/components/MomentAlbumSheet";
import { SelectionAlbumSheet } from "@/components/SelectionAlbumSheet";
import { Button } from "@/components/Button";
import { confirmSheet } from "@/components/ConfirmSheet";
import { deleteMoments } from "@/lib/deleteMoments";
import { deleteMomentsConfirm, stopSongOfDeletedMoment } from "@/lib/momentActions";
import {
  albumAddNotice,
  bulkDeleteFailedTitle,
  pruneSelection,
  selectionTitle,
  toggleSelected,
} from "@/lib/momentSelection";
import { invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Icon } from "@/components/Icon";
import { CalendarView, type CalendarMoment } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { setJournalSelecting } from "@/lib/journalSelecting";
import { DailyCheckInOffer } from "@/components/DailyCheckInOffer";
import { LastWeekRow } from "@/components/LastWeekRow";
import { useLastWeek } from "@/hooks/useLastWeek";
import { lastWeekRowState } from "@/lib/lastWeek";
import { Album, Moment, MomentCardData } from "@/types";

const REFETCH_COOLDOWN_MS = 30_000;
// Reconnects can flap in a weak signal; a refresh within this window is enough.
const RECONNECT_COOLDOWN_MS = 10_000;
// One automatic retry when the launch network fetch fails after a cache paint.
const NETWORK_RETRY_MS = 5_000;
// Unread-shares count is a badge-style query — 60s staleTime per the convention.
const SHARED_BADGE_STALE_MS = 60_000;
// How long a brief notice ("Added 3 moments to …") stays up.
const NOTICE_MS = 2_500;
const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/**
 * Every moment, just the columns the calendar draws, in timeline order (so a
 * day's tile is the same moment the list shows first). Paged: one response
 * stops at 1000 rows. Null on failure.
 */
async function fetchCalendarRows(userId: string): Promise<CalendarMoment[] | null> {
  try {
    const rows = await fetchAllRows<any>((from, to) =>
      supabase
        .from("moments")
        .select("id, moment_date, song_artwork_url, song_title, song_artist")
        .eq("user_id", userId)
        .order("moment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    );
    return rows.map((r): CalendarMoment => ({
      id: r.id,
      momentDate: r.moment_date ?? null,
      songArtworkUrl: r.song_artwork_url ?? "",
      songTitle: r.song_title ?? "",
      songArtist: r.song_artist ?? "",
    }));
  } catch {
    return null;
  }
}

// Throws when the target isn't laid out yet; the calendar tap then just
// lands on the list where it was.
function scrollToMoment(list: SectionList, sectionIndex: number, itemIndex: number) {
  try {
    list.scrollToLocation({ sectionIndex, itemIndex, viewPosition: 0.3, animated: false });
  } catch {}
}

export default function TimelineScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // One Journal offer at a time: the check-in offer waits while Last week's
  // access ask is up (or still loading). Shares LastWeekRow's query.
  const { data: lastWeek, isPending: lastWeekPending } = useLastWeek({ passive: true });
  const lastWeekAsking =
    (lastWeekPending && !!user) ||
    (!!lastWeek &&
      lastWeekRowState({
        week: lastWeek.week,
        access: lastWeek.access,
        askDismissed: lastWeek.askDismissed,
        dismissedWeek: lastWeek.dismissedWeek,
        hasContent: lastWeek.hasContent,
      }) === "ask");
  // Keyed on the id, not the user object: a token refresh replaces the object,
  // and that used to re-run the focus effect and refetch mid-scroll.
  const userId = user?.id;
  const userIdRef = useRef(userId);
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
  const hasMoreRef = useRef(hasMore);

  // Snapshot of the loaded timeline (every page) so the calendar can derive data without another query
  const timelineSnapshotRef = useRef<{ moments: Moment[]; hasMore: boolean } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMoments, setCalendarMoments] = useState<CalendarMoment[]>([]);
  const calendarFetchedRef = useRef<null | boolean>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Select mode (list view only): taps tick cards, a bar offers Add to album
  // and Delete for all of them.
  const [selecting, setSelecting] = useState(false);
  // The tab bar hides the floating capture button while selecting.
  useEffect(() => {
    setJournalSelecting(selecting);
  }, [selecting]);
  useEffect(() => () => setJournalSelecting(false), []);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [bulkAlbumVisible, setBulkAlbumVisible] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  // The card menu's sheets, one instance for the whole list. The moment
  // outlives `visible` so a sheet keeps its content while it slides away.
  const [shareMoment, setShareMoment] = useState<MomentCardData | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [albumMomentId, setAlbumMomentId] = useState<string | null>(null);
  const [albumVisible, setAlbumVisible] = useState(false);
  const queryClient = useQueryClient();
  const player = usePlayerActions();

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

  const viewModeRef = useRef(viewMode);

  // Latest values for the async callbacks below. Synced in a layout effect,
  // not during render (the React Compiler skips components that touch refs in
  // render); it runs in the same commit, before any other effect or callback.
  useLayoutEffect(() => {
    userIdRef.current = userId;
    momentsRef.current = moments;
    hasMoreRef.current = hasMore;
    unviewedUpdatedAtRef.current = unviewedUpdatedAt;
    viewModeRef.current = viewMode;
  }, [userId, moments, hasMore, unviewedUpdatedAt, viewMode]);

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
  const listAnimStyle = useAnimatedStyle(() => ({ opacity: listOpacity.get() }));
  const calendarAnimStyle = useAnimatedStyle(() => ({ opacity: calendarOpacity.get() }));

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

    const rows = await fetchCalendarRows(userId);
    if (userIdRef.current !== userId) return;
    if (rows) {
      setCalendarMoments(rows);
      calendarFetchedRef.current = true;
    } else {
      calendarFetchedRef.current = false;
    }
    setCalendarLoading(false);
  }, [userId]);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(EMPTY_SELECTION);
  }, []);

  // Both views stay mounted; this only crossfades them. Fading to the view
  // already shown is a no-op, so callers needn't check first. Select mode is
  // the list's alone, so the calendar ends it.
  const showView = useCallback((mode: "list" | "calendar") => {
    listOpacity.set(withTiming(mode === "list" ? 1 : 0, { duration: 200 }));
    calendarOpacity.set(withTiming(mode === "calendar" ? 1 : 0, { duration: 200 }));
    setViewMode(mode);
    if (mode !== "list") exitSelect();
  }, [listOpacity, calendarOpacity, exitSelect]);

  // Opening the calendar loads it if the list changed since it last did.
  useEffect(() => {
    if (viewMode === "calendar" && calendarFetchedRef.current !== true) fetchCalendarMoments();
  }, [viewMode, fetchCalendarMoments]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch().onEnd((e) => {
        "worklet";
        if (e.scale < 0.75) {
          runOnJS(showView)("list");
        } else if (e.scale > 1.3) {
          runOnJS(showView)("calendar");
        }
      }),
    [showView]
  );

  const navigation = useNavigation();

  useEffect(() => {
    return navigation.addListener("tabPress" as any, () => {
      if (viewMode === "calendar") showView("list");
    });
  }, [navigation, viewMode, showView]);

  const handleDayPress = useCallback((momentId: string) => {
    showView("list");
    setPendingScrollId(momentId);
  }, [showView]);

  // Each month's title is formatted once (lib/monthGroups.ts), not per moment.
  const sections = useMemo(() => groupMomentsByMonth(moments), [moments]);

  useEffect(() => {
    if (!pendingScrollId || sections.length === 0) return;
    const sectionIndex = sections.findIndex((s) => s.data.some((m) => m.id === pendingScrollId));
    if (sectionIndex < 0) return;
    const itemIndex = sections[sectionIndex].data.findIndex((m) => m.id === pendingScrollId);
    setPendingScrollId(null);
    setTimeout(() => {
      const list = sectionListRef.current;
      if (list) scrollToMoment(list, sectionIndex, itemIndex);
    }, 100);
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

  // The launch retry calls the latest fetchMoments through this; declared
  // before the callbacks that read it so the compiler knows it's a ref.
  const fetchMomentsRef = useRef<(showLoading: boolean) => Promise<void>>(() => Promise.resolve());

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

  // .finally() rather than try/finally, which the React Compiler can't handle.
  const fetchMoments = useCallback(
    (showLoading: boolean, append = false, skipPrefetch = false): Promise<void> =>
      fetchMomentsInner(showLoading, append, skipPrefetch).finally(() => {
        if (!append) refreshInFlightRef.current = false;
      }),
    [fetchMomentsInner]
  );
  useEffect(() => {
    fetchMomentsRef.current = fetchMoments;
  }, [fetchMoments]);

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

  // Back online after a dead zone: catch up, unless a refresh just ran.
  useOnReconnect(() => {
    if (!userId || lastFetchTime.current === 0) return;
    if (needsRefreshRef.current || Date.now() - lastFetchTime.current >= RECONNECT_COOLDOWN_MS) {
      fetchMoments(false);
    }
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
  const removeFromList = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids);
    const list = momentsRef.current.filter((m) => !gone.has(m.id));
    applyList(list, hasMoreRef.current);
    persistFirstPage(list);
    setCalendarMoments((prev) => prev.filter((m) => !gone.has(m.id)));
  }, [applyList, persistFirstPage]);
  const handleCardDeleted = useCallback((deletedId: string) => removeFromList([deletedId]), [removeFromList]);

  // ── Select mode ─────────────────────────────────────────────────────────
  // Leaving the tab (or pushing a screen over it) ends it.
  useFocusEffect(useCallback(() => exitSelect, [exitSelect]));

  // A moment that leaves the list (deleted elsewhere, a refresh) leaves the
  // selection too; with nothing left to select, select mode ends.
  useEffect(() => {
    if (moments.length === 0) {
      exitSelect();
      return;
    }
    setSelected((prev) => pruneSelection(prev, moments.map((m) => m.id)));
  }, [moments, exitSelect]);

  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(notice);
    const t = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const enterSelect = useCallback((firstId?: string) => {
    Haptics.selectionAsync();
    setNotice("");
    setSelecting(true);
    setSelected(firstId ? new Set([firstId]) : EMPTY_SELECTION);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => toggleSelected(prev, id));
  }, []);

  // The card menu's Share, Add to album and Select.
  const handleMenuAction = useCallback((action: CardMenuAction, item: MomentCardData) => {
    if (action === "select") {
      enterSelect(item.id);
    } else if (action === "share") {
      Haptics.selectionAsync();
      setShareMoment(item);
      setShareVisible(true);
      posthog?.capture("moment_shared", { song_title: item.songTitle, song_artist: item.songArtist, from: "journal_menu" });
    } else {
      Haptics.selectionAsync();
      setAlbumMomentId(item.id);
      setAlbumVisible(true);
    }
  }, [enterSelect, posthog]);

  // The share sheet's own Add to album row, once that sheet has closed.
  const shareToAlbum = useCallback(() => {
    if (!shareMoment) return;
    setAlbumMomentId(shareMoment.id);
    setAlbumVisible(true);
  }, [shareMoment]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  const handleBulkAdded = useCallback((album: Album, result: { added: string[]; skipped: string[] }) => {
    setBulkAlbumVisible(false);
    exitSelect();
    posthog?.capture("moments_added_to_album", { count: result.added.length, skipped: result.skipped.length });
    setNotice(albumAddNotice(album.name, result.added.length, result.skipped.length));
  }, [exitSelect, posthog]);

  const handleBulkDelete = useCallback(async () => {
    if (bulkDeleting || selected.size === 0) return;
    const targets = momentsRef.current.filter((m) => selected.has(m.id));
    if (targets.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (!(await confirmSheet(deleteMomentsConfirm(targets.length)))) return;
    setBulkDeleting(true);
    const result = await deleteMoments(targets);
    setBulkDeleting(false);

    const deleted = new Set(result.succeeded);
    // Gone moments shouldn't keep playing (or linger paused in the mini player).
    for (const m of targets) {
      if (!deleted.has(m.id)) continue;
      stopSongOfDeletedMoment(player, m);
      posthog?.capture("moment_deleted", { song_title: m.songTitle, song_artist: m.songArtist, bulk: true });
    }
    if (result.succeeded.length > 0) {
      invalidateMomentCaches(queryClient, userId);
      removeFromList(result.succeeded);
    }
    if (result.failed.length > 0) {
      // The ones that didn't go stay ticked, ready to try again.
      setSelected(new Set(result.failed));
      Alert.alert(bulkDeleteFailedTitle(result.failed.length, targets.length), friendlyError(result.firstError));
      return;
    }
    exitSelect();
  }, [bulkDeleting, selected, player, posthog, queryClient, userId, removeFromList, exitSelect]);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      onDeleted={handleCardDeleted}
      currentUserId={userId}
      onMenuAction={handleMenuAction}
      selecting={selecting}
      selected={selecting && selected.has(item.id)}
      onToggleSelect={toggleSelect}
    />
  ), [allMoods, handleCardDeleted, userId, handleMenuAction, selecting, selected, toggleSelect]);

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
          <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      ) : null}
      {bannerError ? (
        <ErrorBanner
          message={bannerError}
          onRetry={() => fetchMoments(false)}
          onDismiss={() => setBannerError("")}
        />
      ) : null}
      {/* Offers step aside while choosing moments. */}
      {userId && !selecting ? <LastWeekRow /> : null}
      {userId && !selecting ? (
        <DailyCheckInOffer userId={userId} hasMoments={moments.length > 0} waiting={lastWeekAsking} />
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        leading="none"
        title={selecting ? selectionTitle(selected.size) : "Journal"}
        right={
          selecting ? (
            <Button
              label="Done"
              variant="text"
              size="pill"
              onPress={exitSelect}
              testID="select-done"
            />
          ) : (
          <>
            {viewMode === "list" && moments.length > 0 ? (
              <Button
                label="Select"
                variant="text"
                size="pill"
                onPress={() => enterSelect()}
                testID="journal-select"
                // Not just "Select": the card menu has a "Select" too.
                accessibilityLabel="Select moments"
                accessibilityHint="Pick moments to add to an album or delete"
              />
            ) : null}
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
                      else if (viewMode !== seg.key) showView(seg.key);
                    }}
                  >
                    <Icon
                      name={seg.icon}
                      size={17}
                      color={active ? theme.colors.text : theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
          )
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
                      tintColor={theme.colors.textSecondary}
                    />
                  }
                >
                  <View style={styles.emptyHeader}>{listHeader}</View>
                  <EmptyState
                    icon="musical-notes-outline"
                    title="No moments yet"
                    subtitle={"A moment is a song paired with a memory —\nwhat you felt, who you were with, and why it mattered."}
                    action={{ label: "Capture a song", onPress: () => router.push("/create"), testID: "journal-empty-capture" }}
                  />
                </ScrollView>
              ) : (
                <SectionList
                  ref={sectionListRef}
                  sections={sections}
                  extraData={selected}
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
                        style={styles.footerSpinner}
                        color={theme.colors.textSecondary}
                      />
                    ) : undefined
                  }
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  stickySectionHeadersEnabled={false}
                  keyboardDismissMode="on-drag"
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={theme.colors.textSecondary}
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

        {/* Select mode's actions, just above the tab bar. Left-aligned so the
            floating capture button keeps its corner. */}
        {selecting ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.selectBar}>
            <Button
              label="Add to album"
              icon="albums-outline"
              variant="text"
              size="pill"
              disabled={selected.size === 0 || bulkDeleting}
              onPress={() => setBulkAlbumVisible(true)}
              testID="select-bar-album"
            />
            <Button
              label="Delete"
              icon="trash-outline"
              variant="text"
              size="pill"
              tone="destructive"
              disabled={selected.size === 0}
              loading={bulkDeleting}
              onPress={() => void handleBulkDelete()}
              testID="select-bar-delete"
            />
          </Animated.View>
        ) : null}

        <View style={styles.noticeWrap} pointerEvents="none">
          {notice ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={styles.notice}>
              <Icon name="checkmark" size={16} color={theme.colors.text} />
              <Text style={styles.noticeText} numberOfLines={2}>{notice}</Text>
            </Animated.View>
          ) : null}
        </View>
      </View>

      {userId && shareMoment ? (
        <MomentShareHost
          moment={shareMoment}
          visible={shareVisible}
          onClose={() => setShareVisible(false)}
          onAddToAlbum={shareToAlbum}
        />
      ) : null}
      {userId ? (
        <>
          <MomentAlbumSheet
            momentId={albumMomentId}
            visible={albumVisible}
            onClose={() => setAlbumVisible(false)}
            userId={userId}
          />
          <SelectionAlbumSheet
            visible={bulkAlbumVisible}
            momentIds={selectedIds}
            userId={userId}
            onClose={() => setBulkAlbumVisible(false)}
            onAdded={handleBulkAdded}
          />
        </>
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
      paddingBottom: theme.spacing.xs,
    },
    segmented: {
      flexDirection: "row",
      alignItems: "center",
      padding: 3,
      gap: 2,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.fill,
    },
    segment: {
      width: 36,
      height: 32,
      borderRadius: theme.radii.full,
      alignItems: "center",
      justifyContent: "center",
    },
    // Segment lift (DESIGN.md, Shadow Vocabulary): white with a faint ink
    // shadow on paper; on night, the border step (lighter than the track, so
    // it reads raised, not as a hole) and no shadow.
    segmentActive: {
      backgroundColor: theme.isDark ? theme.colors.border : theme.colors.elevated,
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
    footerSpinner: {
      paddingVertical: theme.spacing.xl,
    },
    // Over the bottom of the list, which already clears 110pt for the
    // capture button; the right side stays free for that button.
    selectBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.lg,
      paddingLeft: theme.spacing.lg,
      paddingRight: 100,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    // A brief notice where the select bar was: a raised surface with a
    // hairline edge, no shadow, clear of the capture button.
    noticeWrap: {
      position: "absolute",
      left: theme.spacing.xl,
      right: 100,
      bottom: theme.spacing.lg,
      alignItems: "flex-start",
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    noticeText: {
      ...theme.typography.callout,
      color: theme.colors.text,
      flexShrink: 1,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      // Clears the floating capture button so the last entry is never under it.
      paddingBottom: 110,
    },
  });
}
