import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  TextInput,
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
import { fetchCollections, fetchSharedCollectionMoments } from "@/lib/collections";
import { consumePendingCollectionId } from "@/lib/pendingCollection";
import { consumeTimelineStale } from "@/lib/timelineRefresh";
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
import { Collection, Moment, MoodOption } from "@/types";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

const REFETCH_COOLDOWN_MS = 30_000;
const DEBOUNCE_MS = 300;

function escapeLike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function dateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TimelineScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();

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
  const selectedCollectionRef = useRef(selectedCollection);
  selectedCollectionRef.current = selectedCollection;

  // Search & filter state
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedMoods, setSelectedMoods] = useState<MoodOption[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [allPeople, setAllPeople] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to keep fetchMoments identity stable (avoids useFocusEffect loop)
  const debouncedSearchRef = useRef(debouncedSearch);
  debouncedSearchRef.current = debouncedSearch;
  const selectedMoodsRef = useRef(selectedMoods);
  selectedMoodsRef.current = selectedMoods;
  const selectedPeopleRef = useRef(selectedPeople);
  selectedPeopleRef.current = selectedPeople;
  const dateFromRef = useRef(dateFrom);
  dateFromRef.current = dateFrom;
  const dateToRef = useRef(dateTo);
  dateToRef.current = dateTo;
  const debouncedLocationRef = useRef(debouncedLocation);
  debouncedLocationRef.current = debouncedLocation;

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const sectionListRef = useRef<SectionList>(null);

  const listOpacity = useSharedValue(1);
  const calendarOpacity = useSharedValue(0);
  const listAnimStyle = useAnimatedStyle(() => ({ opacity: listOpacity.value }));
  const calendarAnimStyle = useAnimatedStyle(() => ({ opacity: calendarOpacity.value }));

  // Stable ref so pinch worklet always reads current viewMode
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

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
    }
  }, []);

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
    } else {
      calendarOpacity.value = withTiming(0, { duration: 200 });
      listOpacity.value = withTiming(1, { duration: 200 });
      setViewMode("list");
    }
  }, [viewMode]);

  const handleDayPress = useCallback((momentId: string) => {
    calendarOpacity.value = withTiming(0, { duration: 200 });
    listOpacity.value = withTiming(1, { duration: 200 });
    setViewMode("list");
    setPendingScrollId(momentId);
  }, []);

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    selectedMoods.length > 0 ||
    selectedPeople.length > 0 ||
    dateFrom !== null ||
    dateTo !== null ||
    debouncedLocation.length > 0 ||
    selectedCollection !== null;

  // Dot only reflects manual filters — collection selection is a view mode, not a filter
  const hasFilterDot =
    debouncedSearch.length > 0 ||
    selectedMoods.length > 0 ||
    selectedPeople.length > 0 ||
    dateFrom !== null ||
    dateTo !== null ||
    debouncedLocation.length > 0;

  const hasChipFilters =
    selectedMoods.length > 0 ||
    selectedPeople.length > 0 ||
    dateFrom !== null ||
    dateTo !== null ||
    debouncedLocation.length > 0;

  // Debounce search text
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText]);

  // Debounce location search
  useEffect(() => {
    if (locationDebounceTimer.current) clearTimeout(locationDebounceTimer.current);
    locationDebounceTimer.current = setTimeout(() => {
      setDebouncedLocation(locationSearch.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (locationDebounceTimer.current) clearTimeout(locationDebounceTimer.current);
    };
  }, [locationSearch]);

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

  const PAGE_SIZE = 30;

  const fetchMoments = useCallback(
    async (showLoading: boolean, append = false) => {
      if (!user) return;
      if (!append) pageRef.current = 0;
      if (showLoading) setLoading(true);
      setBannerError("");
      if (showLoading) setError("");

      const currentSearch = debouncedSearchRef.current;
      const currentMoods = selectedMoodsRef.current;
      const currentPeople = selectedPeopleRef.current;
      const currentDateFrom = dateFromRef.current;
      const currentDateTo = dateToRef.current;
      const currentLocation = debouncedLocationRef.current;
      const currentCollection = selectedCollectionRef.current;
      const filtersActive =
        currentSearch.length > 0 ||
        currentMoods.length > 0 ||
        currentPeople.length > 0 ||
        currentDateFrom !== null ||
        currentDateTo !== null ||
        currentLocation.length > 0 ||
        currentCollection !== null;

      let query = supabase
        .from("moments")
        .select("*")
        .eq("user_id", user!.id)
        .order("moment_date", { ascending: false, nullsFirst: false });

      if (currentSearch.length > 0) {
        const term = escapeLike(currentSearch);
        query = query.or(
          `song_title.ilike.%${term}%,song_artist.ilike.%${term}%,reflection_text.ilike.%${term}%`
        );
      }

      if (currentMoods.length > 0) {
        query = query.in("mood", currentMoods);
      }

      if (currentPeople.length > 0) {
        query = query.overlaps("people", currentPeople);
      }

      if (currentDateFrom) {
        query = query.gte("moment_date", currentDateFrom);
      }

      if (currentDateTo) {
        query = query.lte("moment_date", currentDateTo);
      }

      if (currentLocation.length > 0) {
        query = query.ilike("location", `%${escapeLike(currentLocation)}%`);
      }

      if (currentCollection) {
        if (currentCollection.isPublic) {
          // Shared collection: fetch all contributors' moments (owner and members)
          const shared = await fetchSharedCollectionMoments(currentCollection.id);
          setMoments(shared);
          setHasMore(false);
          setLoading(false);
          lastFetchTime.current = Date.now();
          return;
        }
        // Owned collection: filter own moments by collection membership
        const { data: cm } = await supabase
          .from("collection_moments")
          .select("moment_id")
          .eq("collection_id", currentCollection.id);
        const ids = (cm ?? []).map((r: any) => r.moment_id);
        if (ids.length === 0) {
          setMoments([]);
          setHasMore(false);
          setLoading(false);
          lastFetchTime.current = Date.now();
          return;
        }
        query = query.in("id", ids);
      }

      // Paginate only on the unfiltered "All Moments" view
      if (!filtersActive) {
        const from = pageRef.current * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1);
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
      setHasMore(!filtersActive && mapped.length === PAGE_SIZE);
      setLoading(false);
      lastFetchTime.current = Date.now();

      // Populate allPeople — accumulates across pages
      if (!filtersActive) {
        const peopleSet = new Set<string>();
        if (append) {
          setAllPeople((prev) => {
            for (const p of prev) peopleSet.add(p);
            for (const m of mapped) for (const p of m.people) peopleSet.add(p);
            return Array.from(peopleSet).sort();
          });
        } else {
          for (const m of mapped) for (const p of m.people) peopleSet.add(p);
          setAllPeople(Array.from(peopleSet).sort());
        }
      }
    },
    [user]
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
      const data = await fetchCollections(user.id);
      setCollections(data);
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

  // Re-fetch when filters change
  useEffect(() => {
    if (lastFetchTime.current > 0) {
      fetchMoments(false);
    }
  }, [debouncedSearch, selectedMoods, selectedPeople, dateFrom, dateTo, debouncedLocation, selectedCollection, fetchMoments]);

  useFocusEffect(
    useCallback(() => {
      // Reset filters on tab focus (functional updates avoid new refs when already empty)
      setSearchText((prev) => (prev === "" ? prev : ""));
      setDebouncedSearch((prev) => (prev === "" ? prev : ""));
      setSelectedMoods((prev) => (prev.length === 0 ? prev : []));
      setSelectedPeople((prev) => (prev.length === 0 ? prev : []));
      setDateFrom((prev) => (prev === null ? prev : null));
      setDateTo((prev) => (prev === null ? prev : null));
      setLocationSearch((prev) => (prev === "" ? prev : ""));
      setDebouncedLocation((prev) => (prev === "" ? prev : ""));
      setFiltersExpanded(false);

      loadCollections();

      const stale = consumeTimelineStale();
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        fetchMoments(true);
      } else if (stale || elapsed >= REFETCH_COOLDOWN_MS) {
        fetchMoments(false);
      }
    }, [fetchMoments, loadCollections])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMoments(false);
    setRefreshing(false);
  }, [fetchMoments]);

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

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      onPress={() => router.push(`/moment/${item.id}`)}
      allMoods={allMoods}
    />
  ), [router, allMoods]);

  const clearFilters = useCallback(() => {
    setSearchText("");
    setDebouncedSearch("");
    setSelectedMoods([]);
    setSelectedPeople([]);
    setDateFrom(null);
    setDateTo(null);
    setLocationSearch("");
    setDebouncedLocation("");
    setSelectedCollection(null);
  }, []);

  const toggleMood = useCallback((mood: MoodOption) => {
    setSelectedMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  }, []);

  const togglePerson = useCallback((person: string) => {
    setSelectedPeople((prev) =>
      prev.includes(person)
        ? prev.filter((p) => p !== person)
        : [...prev, person]
    );
  }, []);

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

  const showEmptyFilterState = hasActiveFilters && moments.length === 0 && !loading && !error;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}
          style={styles.collectionSelector}
        >
          <Text style={styles.title}>
            {selectedCollection?.name ?? "All Moments"}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {selectedCollection ? (
            <TouchableOpacity
              onPress={() => setShareSheetVisible(true)}
              hitSlop={8}
            >
              <Ionicons
                name={selectedCollection.role === "owner" ? "share-outline" : "ellipsis-horizontal"}
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
          {viewMode === "list" ? (
            <TouchableOpacity
              onPress={() => setFiltersExpanded((v) => !v)}
              hitSlop={8}
              style={styles.filterToggle}
            >
              <Ionicons
                name={filtersExpanded ? "options" : "options-outline"}
                size={22}
                color={theme.colors.text}
              />
              {hasFilterDot && !filtersExpanded ? (
                <View style={styles.filterBadge} />
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Sticky search + filter zone */}
      <View style={styles.stickyZone}>
        {/* Search bar — always shown */}
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={theme.colors.placeholder}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, reflections..."
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Full filter panel — only when filtersExpanded */}
        {filtersExpanded ? (
          <View style={styles.filterPanel}>
            <Text style={styles.filterLabel}>Mood</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {allMoods.map((mood) => {
                const selected = selectedMoods.includes(mood.value);
                return (
                  <TouchableOpacity
                    key={mood.value}
                    style={[styles.filterChip, selected && styles.filterChipSelected]}
                    onPress={() => toggleMood(mood.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                      {mood.emoji} {mood.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {allPeople.length > 0 ? (
              <>
                <Text style={styles.filterLabel}>People</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {allPeople.map((person) => {
                    const selected = selectedPeople.includes(person);
                    return (
                      <TouchableOpacity
                        key={person}
                        style={[styles.filterChip, selected && styles.filterChipSelected]}
                        onPress={() => togglePerson(person)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                          {person}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <Text style={styles.filterLabel}>Date Range</Text>
            <View style={styles.dateRangeRow}>
              <View style={styles.dateRangeItem}>
                <Text style={styles.dateRangeItemLabel}>From</Text>
                {dateFrom ? (
                  <View style={styles.datePickerRow}>
                    <DateTimePicker
                      value={new Date(dateFrom + "T00:00:00")}
                      mode="date"
                      display="compact"
                      maximumDate={dateTo ? new Date(dateTo + "T00:00:00") : new Date()}
                      onChange={(_: DateTimePickerEvent, date?: Date) => date && setDateFrom(dateToStr(date))}
                      themeVariant={theme.isDark ? "dark" : "light"}
                      accentColor={theme.colors.accent}
                    />
                    <TouchableOpacity onPress={() => setDateFrom(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={theme.colors.placeholder} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setDateFrom(dateToStr(new Date()))} activeOpacity={0.7}>
                    <Text style={styles.dateAnyText}>Any</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.dateRangeItem}>
                <Text style={styles.dateRangeItemLabel}>To</Text>
                {dateTo ? (
                  <View style={styles.datePickerRow}>
                    <DateTimePicker
                      value={new Date(dateTo + "T00:00:00")}
                      mode="date"
                      display="compact"
                      minimumDate={dateFrom ? new Date(dateFrom + "T00:00:00") : undefined}
                      maximumDate={new Date()}
                      onChange={(_: DateTimePickerEvent, date?: Date) => date && setDateTo(dateToStr(date))}
                      themeVariant={theme.isDark ? "dark" : "light"}
                      accentColor={theme.colors.accent}
                    />
                    <TouchableOpacity onPress={() => setDateTo(null)} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={theme.colors.placeholder} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setDateTo(dateToStr(new Date()))} activeOpacity={0.7}>
                    <Text style={styles.dateAnyText}>Any</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.filterLabel}>Location</Text>
            <View style={styles.locationFilterInput}>
              <TextInput
                style={styles.locationFilterText}
                placeholder="Search by location..."
                placeholderTextColor={theme.colors.placeholder}
                cursorColor={theme.colors.accent}
                value={locationSearch}
                onChangeText={setLocationSearch}
                returnKeyType="search"
              />
              {locationSearch.length > 0 ? (
                <TouchableOpacity onPress={() => setLocationSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Active filter chips — only when panel closed and mood/people filters active */}
        {!filtersExpanded && hasChipFilters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeChipsRow}>
            {selectedMoods.map((moodValue) => {
              const mood = allMoods.find((m) => m.value === moodValue);
              return (
                <TouchableOpacity
                  key={moodValue}
                  style={styles.activeChip}
                  onPress={() => toggleMood(moodValue)}
                >
                  <Text style={styles.activeChipText}>{mood?.emoji} {mood?.label} ✕</Text>
                </TouchableOpacity>
              );
            })}
            {selectedPeople.map((person) => (
              <TouchableOpacity
                key={person}
                style={styles.activeChip}
                onPress={() => togglePerson(person)}
              >
                <Text style={styles.activeChipText}>{person} ✕</Text>
              </TouchableOpacity>
            ))}
            {(dateFrom || dateTo) ? (
              <TouchableOpacity
                style={styles.activeChip}
                onPress={() => { setDateFrom(null); setDateTo(null); }}
              >
                <Text style={styles.activeChipText}>
                  {dateFrom ? formatDateLabel(dateFrom) : "Any"} – {dateTo ? formatDateLabel(dateTo) : "Any"} ✕
                </Text>
              </TouchableOpacity>
            ) : null}
            {debouncedLocation.length > 0 ? (
              <TouchableOpacity
                style={styles.activeChip}
                onPress={() => { setLocationSearch(""); setDebouncedLocation(""); }}
              >
                <Text style={styles.activeChipText}>{debouncedLocation} ✕</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      <GestureDetector gesture={pinchGesture}>
      <View style={styles.viewsContainer}>
        <Animated.View style={[StyleSheet.absoluteFill, listAnimStyle]} pointerEvents={viewMode === "list" ? "auto" : "none"}>
          {loading && moments.length === 0 && !hasActiveFilters ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonTimelineCard key={i} />
              ))}
            </View>
          ) : error && !hasActiveFilters ? (
            <ErrorState
              message={error}
              onRetry={() => fetchMoments(true)}
            />
          ) : !hasActiveFilters && moments.length === 0 && !loading ? (
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
                showEmptyFilterState ? (
                  <View style={styles.emptyFilter}>
                    <Text style={styles.emptyFilterText}>
                      {selectedCollection
                        ? `No moments in "${selectedCollection.name}"`
                        : "No moments match your filters"}
                    </Text>
                    <TouchableOpacity
                      style={styles.clearFiltersButton}
                      onPress={clearFilters}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clearFiltersButtonText}>
                        Clear Filters
                      </Text>
                    </TouchableOpacity>
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
          <CalendarView moments={moments} onDayPress={handleDayPress} theme={theme} />
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

      {/* Floating action button */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.colors.accent,
            bottom: 16,
          },
        ]}
        onPress={() => router.push("/create")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 80,
      paddingBottom: theme.spacing.lg,
    },
    collectionSelector: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flex: 1,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 5,
    },
    viewsContainer: {
      flex: 1,
    },
    filterToggle: {
      position: "relative",
      padding: theme.spacing.xs,
    },
    filterBadge: {
      position: "absolute",
      top: 2,
      right: 2,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    stickyZone: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
      height: 40,
    },
    activeChipsRow: {
      marginBottom: theme.spacing.sm,
    },
    activeChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipSelectedBg,
      marginRight: theme.spacing.sm,
    },
    activeChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipSelectedText,
    },
    searchIcon: {
      marginRight: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      padding: 0,
    },
    filterPanel: {
      marginBottom: theme.spacing.md,
    },
    filterLabel: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    chipRow: {
      marginBottom: theme.spacing.md,
    },
    filterChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
      marginRight: theme.spacing.sm,
    },
    filterChipSelected: {
      backgroundColor: theme.colors.chipSelectedBg,
    },
    filterChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    filterChipTextSelected: {
      color: theme.colors.chipSelectedText,
    },
    dateRangeRow: {
      flexDirection: "row",
      gap: theme.spacing.xl,
      marginBottom: theme.spacing.md,
    },
    dateRangeItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    dateRangeItemLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.medium,
    },
    datePickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dateAnyText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    locationFilterInput: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
      height: 36,
    },
    locationFilterText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      padding: 0,
    },
    emptyFilter: {
      alignItems: "center",
      paddingTop: theme.spacing["4xl"],
    },
    emptyFilterText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.lg,
      textAlign: "center",
    },
    clearFiltersButton: {
      paddingVertical: 10,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
    },
    clearFiltersButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
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
