import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  Linking,
  InteractionManager,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { consumeCardOrigin } from "@/lib/cardTransition";
import { consumeCachedMoment } from "@/lib/momentCache";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl } from "@/lib/storage";
import { deleteMomentWithCleanup } from "@/lib/deleteMoment";
import { mapRowToMoment } from "@/lib/moments";
import {
  fetchAlbums,
  addMomentToAlbum,
  removeMomentFromAlbum,
  createAlbum,
} from "@/lib/albums";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { confirmSheet } from "@/components/ConfirmSheet";
import { friendlyError } from "@/lib/errors";
import { Album, Moment, MoodOption } from "@/types";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { invalidateMomentCaches, invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { ShareMomentSheet } from "@/components/ShareMomentSheet";
import { BottomSheet } from "@/components/BottomSheet";
import { Ionicons } from "@expo/vector-icons";
import { formatTime } from "@/lib/formatTime";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

export default function MomentDetailScreen() {
  const {
    id,
    returnTo,
    collectionId,
    collectionRole,
    contributorName,
  } = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    collectionId?: string;
    collectionRole?: string;
    contributorName?: string;
  }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentSong, isPlaying, playbackTime, playbackDuration, playError, playFull, pause, resume, seekTo, stop } = usePlayer();
  const theme = useTheme();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  // The paper bar behind the status bar and buttons fades in as the hero
  // band scrolls off, so text never slides under the Dynamic Island and the
  // buttons never float over writing.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // The artwork's top edge reaches the bar after ~36pt of scroll, so the bar
  // is fully in by then.
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [12, 48], [0, 1], Extrapolation.CLAMP),
  }));
  // Only accept the cached moment if it's actually the one being opened. A
  // swallowed navigation leaves a stale value in the module-level slot, and
  // entries that don't populate it (push-notification taps) would otherwise
  // render — and autoplay — someone else's moment.
  const [moment, setMoment] = useState<Moment | null>(() => {
    const cached = consumeCachedMoment();
    return cached && cached.id === id ? cached : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  // Album membership state
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [allCollections, setAllCollections] = useState<Album[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [savingCollections, setSavingCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showingNewInput, setShowingNewInput] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [origin] = useState(() => consumeCardOrigin());
  const translateX = useSharedValue(origin.active ? origin.x : 0);
  const translateY = useSharedValue(origin.active ? origin.y : 0);
  const scaleAnim = useSharedValue(origin.active ? origin.scale : 1);
  const opacity = useSharedValue(origin.active ? 0 : 1);

  const animateOut = useCallback((then: () => void) => {
    opacity.value = withTiming(0, { duration: 120 });
    scaleAnim.value = withTiming(0.95, { duration: 120 }, () => {
      "worklet";
      runOnJS(then)();
    });
  }, []);

  const goBack = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.back();
    }
  }, [router, returnTo]);

  useEffect(() => {
    const config = { duration: 320, easing: Easing.out(Easing.cubic) };
    opacity.value = withTiming(1, { duration: 180 });
    translateX.value = withTiming(0, config);
    translateY.value = withTiming(0, config);
    scaleAnim.value = withTiming(1, config);
  }, []);

  // A handle on the ScrollView's own scroll gesture, so the pans on this screen
  // can declare a relation to it instead of leaving arbitration to emerge from
  // whichever recognizer happens to fire first. A plain ref would not do: RNGH
  // resolves relation refs through a `handlerTag` that RN's ScrollView doesn't
  // carry, so passing one silently registers nothing.
  const scrollNativeGesture = useMemo(() => Gesture.Native(), []);

  const progressBarWidthRef = useRef(1);
  const progressDurationRef = useRef(playbackDuration);
  progressDurationRef.current = playbackDuration;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;

  const handleProgressSeek = useCallback((x: number) => {
    const ratio = Math.max(0, Math.min(1, x / progressBarWidthRef.current));
    seekToRef.current(ratio * progressDurationRef.current);
  }, []);

  const hasAutoPlayed = useRef(false);
  const momentRef = useRef(moment);
  momentRef.current = moment;
  const playerRef = useRef({ currentSong, isPlaying });
  playerRef.current = { currentSong, isPlaying };
  useEffect(() => {
    if (hasAutoPlayed.current) return;
    const m = momentRef.current;
    if (!m?.songAppleMusicId && !m?.songSpotifyId) return;
    hasAutoPlayed.current = true;
    const timer = setTimeout(() => {
      const current = momentRef.current;
      if (!current?.songAppleMusicId && !current?.songSpotifyId) return;
      const momentSongId = current.songSpotifyId ?? current.songAppleMusicId;
      const { currentSong: cs, isPlaying: ip } = playerRef.current;
      const playingId = cs?.spotifyId ?? cs?.appleMusicId;
      if (playingId === momentSongId && ip) return;
      playFull(
        {
          id: momentSongId ?? "",
          title: current.songTitle,
          artistName: current.songArtist,
          albumName: current.songAlbumName ?? "",
          artworkUrl: current.songArtworkUrl,
          provider: current.songProvider ?? 'apple_music',
          appleMusicId: current.songAppleMusicId ?? null,
          spotifyId: current.songSpotifyId ?? null,
          durationMs: 0,
        },
        current.songPreviewUrl || undefined
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [moment?.id]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleAnim.value },
    ],
  }));

  // Swipe right to dismiss. This screen is a transparentModal with no native
  // swipe-back, so the pan has to exist — but it must never be the reason a
  // vertical drag failed to scroll. It declares itself simultaneous with the
  // ScrollView so the scroll is never cancelled while the pan is deciding, and
  // fails on 8px of vertical travel so an ambiguous drag resolves to a scroll.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([40, Infinity])
        .failOffsetY([-8, 8])
        .simultaneousWithExternalGesture(scrollNativeGesture)
        .onUpdate((e) => {
          "worklet";
          translateX.value = Math.max(0, e.translationX);
          opacity.value = Math.max(0, 1 - e.translationX / 220);
        })
        .onEnd((e) => {
          "worklet";
          if (e.translationX > 60 || e.velocityX > 400) {
            runOnJS(animateOut)(goBack);
          } else {
            translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
            opacity.value = withTiming(1, { duration: 200 });
          }
        }),
    [animateOut, goBack, scrollNativeGesture]
  );

  // Scrubbing. The seek fires on `.onStart` (activation), never `.onBegin`
  // (touch-down) — the old onBegin meant resting a finger anywhere in the 28pt
  // band around the 2px bar jumped playback, including on a drag that was only
  // passing through on its way to scrolling the page.
  //
  // The 2:1 ratio between the offsets is what separates a scrub from a scroll:
  // the seek only wins on drags within ~27° of horizontal, anything steeper
  // trips failOffsetY and goes back to the ScrollView. Both numbers are kept
  // small on purpose — activating at 12px lost a fast rightward flick to
  // swipeGesture's 40px close (verified on device), so the seek needs to claim
  // the drag well before the dismiss threshold is anywhere in reach.
  const seekPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-3, 3])
        .onStart((e) => { runOnJS(handleProgressSeek)(e.x); })
        .onUpdate((e) => { runOnJS(handleProgressSeek)(e.x); })
        .blocksExternalGesture(swipeGesture),
    [handleProgressSeek, swipeGesture]
  );

  // Tap-to-seek, which onBegin used to provide for free. A tap can't be
  // confused with a scroll: it needs the finger to lift within 250ms having
  // moved less than 10px.
  const seekTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .maxDistance(10)
        .onEnd((e, success) => { if (success) { runOnJS(handleProgressSeek)(e.x); } }),
    [handleProgressSeek]
  );

  const seekGesture = useMemo(
    () => Gesture.Race(seekPanGesture, seekTapGesture),
    [seekPanGesture, seekTapGesture]
  );

  const fetchMoment = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setError("");
    const t0 = Date.now();
    const hadPreview = !showLoading; // pre-populated from momentCache
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (showLoading) setError(friendlyError(fetchError));
      setLoading(false);
      return;
    }

    setMoment(mapRowToMoment(data));
    setLoading(false);
    posthog?.capture("moment_detail_open", {
      had_preview: hadPreview,
      duration_ms: Date.now() - t0,
    });
  }, [id, posthog]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        fetchMoment(moment === null);
      });
      return () => { task.cancel(); };
    }, [fetchMoment])
  );

  const photoUrls = useMemo(
    () => moment?.photoUrls.map(getPublicPhotoUrl) ?? [],
    [moment?.photoUrls]
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);
  const getMood = useCallback((value: MoodOption) =>
    allMoods.find((m) => m.value === value), [allMoods]);

  const openMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(true);
  };

  const handleEdit = () => {
    Haptics.selectionAsync();
    setMenuOpen(false);
    if (moment) router.push(`/moment/edit/${moment.id}`);
  };

  const handleAddToCollection = async () => {
    Haptics.selectionAsync();
    setMenuOpen(false);
    setCollectionLoading(true);
    setCollectionModalVisible(true);
    setShowingNewInput(false);
    setNewCollectionName("");
    try {
      // Always fetch fresh: the AsyncStorage albums cache is only written by the
      // launch prefetch, so reading it here showed wrong checkmarks (and hid
      // albums created later in the session) for the rest of the session.
      const cols = await fetchAlbums(user!.id);

      // Derive which albums contain this moment from the momentIds stored on
      // each album — no second network call needed.
      const memberCollectionIds = cols
        .filter((c) => c.momentIds?.includes(id))
        .map((c) => c.id);

      setAllCollections(cols);
      setMemberIds(memberCollectionIds);
      setPendingMemberIds(memberCollectionIds);
    } catch {}
    setCollectionLoading(false);
  };

  const toggleCollection = (collection: Album) => {
    setPendingMemberIds((prev) =>
      prev.includes(collection.id)
        ? prev.filter((cid) => cid !== collection.id)
        : [...prev, collection.id]
    );
  };

  const handleSaveCollections = async () => {
    setSavingCollections(true);
    try {
      const toAdd = pendingMemberIds.filter((cid) => !memberIds.includes(cid));
      const toRemove = memberIds.filter((cid) => !pendingMemberIds.includes(cid));
      await Promise.all([
        ...toAdd.map((cid) => addMomentToAlbum(cid, id, user!.id)),
        ...toRemove.map((cid) => removeMomentFromAlbum(cid, id)),
      ]);
      setMemberIds(pendingMemberIds);
      const changedIds = [...toAdd, ...toRemove];
      if (changedIds.length > 0) {
        invalidateMomentCaches(queryClient, user!.id);
        changedIds.forEach((cid) => invalidateAlbumCaches(queryClient, user!.id, cid));
      }
    } catch {}
    setSavingCollections(false);
    setCollectionModalVisible(false);
  };

  const handleCreateCollection = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || creatingCollection) return;
    setCreatingCollection(true);
    try {
      const collection = await createAlbum(user!.id, trimmed);
      await addMomentToAlbum(collection.id, id, user!.id);
      setAllCollections((prev) => [...prev, collection]);
      setMemberIds((prev) => [...prev, collection.id]);
      setPendingMemberIds((prev) => [...prev, collection.id]);
      setNewCollectionName("");
      setShowingNewInput(false);
      invalidateMomentCaches(queryClient, user!.id);
      invalidateAlbumCaches(queryClient, user!.id, collection.id);
    } catch {}
    setCreatingCollection(false);
  };

  const handleDelete = async () => {
    if (deleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    const confirmed = await confirmSheet({
      title: "Delete Moment",
      message: "Are you sure? This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    const { error: deleteError } = await deleteMomentWithCleanup({
      id,
      photoUrls: moment?.photoUrls ?? [],
      photoThumbnails: moment?.photoThumbnails ?? [],
    });

    if (deleteError) {
      setDeleting(false);
      Alert.alert("Error", friendlyError(deleteError));
      return;
    }

    // The moment is gone — its song shouldn't keep playing (or linger
    // paused in the mini player).
    const deletedSongId = moment?.songSpotifyId ?? moment?.songAppleMusicId;
    const playingSongId = currentSong?.spotifyId ?? currentSong?.appleMusicId;
    if (deletedSongId && deletedSongId === playingSongId) {
      void stop();
    }

    posthog.capture("moment_deleted", { song_title: moment?.songTitle ?? null, song_artist: moment?.songArtist ?? null });
    invalidateMomentCaches(queryClient, user?.id);
    animateOut(goBack);
  };

  const handleRemoveFromCollection = async () => {
    if (!collectionId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    const confirmed = await confirmSheet({
      title: "Remove from Album",
      message: "Remove this moment from the album? The moment won't be deleted.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    const { error: removeError } = await supabase
      .from("collection_moments")
      .delete()
      .eq("collection_id", collectionId)
      .eq("moment_id", id);

    if (removeError) {
      setDeleting(false);
      Alert.alert("Error", friendlyError(removeError));
      return;
    }

    markTimelineStale();
    invalidateMomentCaches(queryClient, user?.id);
    invalidateAlbumCaches(queryClient, user?.id, collectionId);
    animateOut(goBack);
  };

  // Unknown values (a custom mood someone else defined) fall back to a raw chip
  // rather than disappearing.
  const moodDefs = moment
    ? moment.moods.map((value) => getMood(value) ?? { value, emoji: "🎵", label: value })
    : [];

  const hasPhotos = photoUrls.length > 0;

  // "Tuesday, Oct 14 · Morning · Lake Dillon". The year appears only when it
  // isn't this year: old memories need it, today's entries don't.
  const formatEyebrow = (dateStr: string | null, timeOfDay: string | null, location: string | null) => {
    const parts: string[] = [];
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      const sameYear = d.getFullYear() === new Date().getFullYear();
      parts.push(
        d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          ...(sameYear ? {} : { year: "numeric" }),
        })
      );
    }
    if (timeOfDay) parts.push(timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1));
    if (location) parts.push(location);
    return parts.join(" · ");
  };

  const withPeople = (people: string[]) =>
    people.length <= 1
      ? `With ${people[0]}`
      : `With ${people.slice(0, -1).join(", ")} and ${people[people.length - 1]}`;

  const momentSongId = moment?.songSpotifyId ?? moment?.songAppleMusicId;
  const playingSongId = currentSong?.spotifyId ?? currentSong?.appleMusicId;
  const isCurrentSong = isPlaying && !!momentSongId && momentSongId === playingSongId;
  const playLabel = isCurrentSong ? "Pause" : playError ? "Unavailable" : "Play";

  return (
    <GestureDetector gesture={swipeGesture}>
    <Animated.View style={[styles.container, animStyle]}>
      {/* Phase 1: the blurred artwork lives in the hero band and scrolls away
          with it, so the writing always sits on solid paper. As the band
          leaves, a paper bar fades in behind the status bar and buttons. */}
      <Animated.View
        style={[styles.topBar, { height: insets.top + 56 }, topBarStyle]}
        pointerEvents="none"
      />

      {/* Glass nav — pinned above the scroll. box-none so the full-width strip
          itself is transparent to touches and only the two buttons capture
          them; as a plain View it was eating drags across the top of the page. */}
      <View style={[styles.glassNav, { top: insets.top + 6 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.glassBtn} onPress={() => animateOut(goBack)} activeOpacity={0.8} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        {!loading && moment && (
          <View style={styles.glassBtnRow}>
            <TouchableOpacity
              style={styles.glassBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setShareModalVisible(true);
                posthog.capture("moment_shared", { song_title: moment.songTitle, song_artist: moment.songArtist });
              }}
              activeOpacity={0.8}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={18} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.glassBtn} onPress={openMenu} activeOpacity={0.8} hitSlop={8}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {menuOpen && moment && (() => {
        const isOwnMoment = moment.userId === user?.id;
        const isGuest = !!moment.guestUuid;
        const isCollectionOwner = collectionRole === "owner";
        const inCollection = !!collectionId;

        const canEdit = isOwnMoment;
        const canAddToCollection = isOwnMoment;
        const canDelete = isOwnMoment || (isGuest && isCollectionOwner);
        const canRemove = inCollection && (isOwnMoment || isCollectionOwner);
        // Report for non-own, non-guest moments (guests are managed by the owner directly)
        const canReport = !isOwnMoment && !isGuest;

        return (
          <>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  Haptics.selectionAsync();
                  setMenuOpen(false);
                  setShareModalVisible(true);
                  posthog.capture("moment_shared", { song_title: moment.songTitle, song_artist: moment.songArtist });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.menuItemText}>Share Moment</Text>
              </TouchableOpacity>
              {canEdit && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity style={styles.menuItem} onPress={handleEdit} activeOpacity={0.7}>
                    <Text style={styles.menuItemText}>Edit Moment</Text>
                  </TouchableOpacity>
                </>
              )}
              {canAddToCollection && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity style={styles.menuItem} onPress={handleAddToCollection} activeOpacity={0.7}>
                    <Text style={styles.menuItemText}>Add to Album</Text>
                  </TouchableOpacity>
                </>
              )}
              {canReport && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMenuOpen(false);
                      const subject = encodeURIComponent(`Report: ${moment.songTitle} by ${moment.songArtist}`);
                      const body = encodeURIComponent(`Please describe what you'd like to report about this moment:\n\n\n\n---\nMoment ID: ${moment.id}\nContributor: ${moment.contributorName ?? "unknown"}`);
                      Linking.openURL(`mailto:founder@soundtracks.app?subject=${subject}&body=${body}`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.menuItemTextDestructive}>Report Moment</Text>
                  </TouchableOpacity>
                </>
              )}
              {canRemove && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity style={styles.menuItem} onPress={handleRemoveFromCollection} activeOpacity={0.7}>
                    <Text style={styles.menuItemTextDestructive}>Remove from Album</Text>
                  </TouchableOpacity>
                </>
              )}
              {canDelete && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity style={styles.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                    <Text style={styles.menuItemTextDestructive}>Delete Moment</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        );
      })()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonMomentDetail />
        </View>
      ) : error || !moment ? (
        <ErrorState
          message={error || "Moment not found"}
          onRetry={() => fetchMoment(true)}
          onBack={() => animateOut(goBack)}
        />
      ) : (
        // The hero lives INSIDE the scroll view. As a sibling above it, the top
        // ~280pt of the screen — photo, artwork, photo-count pill — was inert to
        // vertical drags, which is most of what "scrolling is hard" meant.
        <GestureDetector gesture={scrollNativeGesture}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Hero section */}
          {hasPhotos ? (
            <View style={[styles.photoHero, { height: insets.top + 380 }]}>
              {/* The photo prints clean: no gradient or caption over it. */}
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
                style={StyleSheet.absoluteFill}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo 1 of ${photoUrls.length}. Open photos`}
              >
                <AppImage source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </TouchableOpacity>
              {photoUrls.length > 1 && (
                <View style={styles.photoCounterPill} pointerEvents="none">
                  <Text style={styles.photoCounterText}>1 / {photoUrls.length}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.ambientHero, { paddingTop: insets.top + 56, height: insets.top + 360 }]}>
              {moment.songArtworkUrl ? (
                <>
                  <AppImage
                    source={{ uri: moment.songArtworkUrl }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={50}
                    contentFit="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, styles.heroVeil]} />
                  <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkHero} contentFit="cover" />
                </>
              ) : (
                <ArtworkPlaceholder style={styles.artworkHero} />
              )}
            </View>
          )}

          <View style={styles.scrollBody}>
            {(moment.momentDate || moment.timeOfDay || moment.location) ? (
              <Text style={styles.eyebrow}>
                {formatEyebrow(moment.momentDate, moment.timeOfDay, moment.location)}
              </Text>
            ) : null}

            {/* With photos the song steps back to a compact row; without, the
                title leads. Title, artist and album each open their pages. */}
            <View style={hasPhotos ? styles.songRow : undefined}>
              {hasPhotos ? (
                moment.songArtworkUrl ? (
                  <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkThumb} contentFit="cover" />
                ) : (
                  <ArtworkPlaceholder style={styles.artworkThumb} />
                )
              ) : null}
              <View style={hasPhotos ? styles.songRowText : undefined}>
                <Text
                  style={[styles.songTitleHero, hasPhotos && styles.songTitleCompact]}
                  numberOfLines={2}
                  onPress={() => router.push({ pathname: "/song", params: { title: moment.songTitle, artist: moment.songArtist } })}
                  accessibilityRole="link"
                >
                  {moment.songTitle}
                </Text>
                <Text style={styles.artistLine} numberOfLines={2}>
                  <Text
                    onPress={() => router.push({ pathname: "/artist", params: { name: moment.songArtist } })}
                    accessibilityRole="link"
                  >
                    {moment.songArtist}
                  </Text>
                  {moment.songAlbumName ? (
                    <>
                      {" · "}
                      <Text
                        onPress={() => router.push({ pathname: "/album", params: { album: moment.songAlbumName, artist: moment.songArtist } })}
                        accessibilityRole="link"
                      >
                        {moment.songAlbumName}
                      </Text>
                    </>
                  ) : null}
                </Text>
              </View>
            </View>

            {/* Player: one compact row. Seeking only while this song plays. */}
            {(moment.songAppleMusicId || moment.songSpotifyId) ? (
              <View style={styles.playerRow}>
                <TouchableOpacity
                  style={[styles.playButton, playError && styles.playButtonError]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={playLabel}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (isCurrentSong) {
                      pause();
                    } else {
                      playFull(
                        {
                          id: moment.songSpotifyId ?? moment.songAppleMusicId ?? "",
                          title: moment.songTitle,
                          artistName: moment.songArtist,
                          albumName: moment.songAlbumName,
                          artworkUrl: moment.songArtworkUrl,
                          provider: moment.songProvider ?? 'apple_music',
                          appleMusicId: moment.songAppleMusicId ?? null,
                          spotifyId: moment.songSpotifyId ?? null,
                          durationMs: 0,
                        },
                        moment.songPreviewUrl || undefined
                      );
                    }
                  }}
                >
                  <Ionicons
                    name={isCurrentSong ? "pause" : "play"}
                    size={18}
                    color={playError ? theme.colors.textTertiary : theme.colors.buttonText}
                  />
                </TouchableOpacity>
                {isCurrentSong && playbackDuration > 0 ? (
                  <>
                    <GestureDetector gesture={seekGesture}>
                      <View
                        style={styles.progressTrackWrapper}
                        onLayout={(e) => { progressBarWidthRef.current = e.nativeEvent.layout.width; }}
                      >
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.min(100, (playbackTime / playbackDuration) * 100)}%` }]} />
                        </View>
                      </View>
                    </GestureDetector>
                    <Text style={styles.progressTime}>
                      {formatTime(playbackTime)} / {formatTime(playbackDuration)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.playHint}>{playError ? "Unavailable" : "Play"}</Text>
                )}
              </View>
            ) : null}

            {(contributorName || moment.contributorName) ? (
              <Text style={styles.contributor} numberOfLines={1}>
                From {contributorName || moment.contributorName}
              </Text>
            ) : null}

            {/* Blank lines become paragraph spacing, not empty 30pt lines. */}
            {moment.reflectionText ? (
              <View style={styles.reflectionBlock}>
                {moment.reflectionText
                  .split(/\n\s*\n/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <Text key={i} style={styles.reflection} selectable>{para}</Text>
                  ))}
              </View>
            ) : null}

            {/* Quiet metadata: people, moods as words, weather. */}
            {(moment.people.length > 0 || moodDefs.length > 0 || moment.weatherCondition) ? (
              <View style={styles.metaBlock}>
                {moment.people.length > 0 ? (
                  <Text style={styles.metaLine}>{withPeople(moment.people)}</Text>
                ) : null}
                {moment.weatherCondition ? (
                  <Text style={styles.metaLine}>
                    {moment.weatherCondition}{moment.weatherTempF != null ? ` · ${moment.weatherTempF}°F` : ""}
                  </Text>
                ) : null}
                {moodDefs.length > 0 ? (
                  <Text style={styles.moodWords}>
                    {moodDefs.map((m) => m.label).join(" · ").toUpperCase()}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* More photos: the hero shows the first; the rest live here. */}
            {hasPhotos && photoUrls.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
                contentContainerStyle={styles.photoStripContent}
              >
                {photoUrls.map((url, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.85}
                    onPress={() => { setViewerIndex(idx); setViewerVisible(true); }}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Photo ${idx + 1} of ${photoUrls.length}`}
                  >
                    <AppImage source={{ uri: url }} style={styles.photoStripThumb} contentFit="cover" transition={200} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {moment.locationLat != null && moment.locationLng != null ? (
              <TouchableOpacity
                style={styles.miniMapContainer}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${moment.location ?? "this place"} in Maps`}
                onPress={() => {
                  const label = encodeURIComponent(moment.location ?? "");
                  Linking.openURL(`maps://?q=${label}&ll=${moment.locationLat},${moment.locationLng}`);
                }}
              >
                <MapView
                  style={StyleSheet.absoluteFill}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude: moment.locationLat,
                    longitude: moment.locationLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  <Marker
                    coordinate={{ latitude: moment.locationLat, longitude: moment.locationLng }}
                    pinColor={theme.colors.accent}
                  />
                </MapView>
                <View style={styles.miniMapHint}>
                  <Ionicons name="map-outline" size={12} color={theme.colors.text} />
                  <Text style={styles.miniMapHintText}>Open in Maps</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.ScrollView>
        </GestureDetector>
      )}

      <PhotoViewer
        photos={photoUrls}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />

      {moment && (
        <ShareMomentSheet
          visible={shareModalVisible}
          moment={moment}
          photoUrls={photoUrls}
          onClose={() => setShareModalVisible(false)}
          onAddToAlbum={handleAddToCollection}
        />
      )}

      {/* Collection membership sheet */}
      <BottomSheet
        visible={collectionModalVisible}
        onClose={() => setCollectionModalVisible(false)}
        title="Add to Album"
        keyboardAvoiding
        maxHeight="60%"
      >
          {collectionLoading ? (
            <View style={collectionStyles.loadingRow}>
              <ActivityIndicator color={theme.colors.textSecondary} />
            </View>
          ) : (
            <FlatList
              data={allCollections}
              keyExtractor={(item) => item.id}
              style={collectionStyles.list}
              ListEmptyComponent={
                <Text style={[collectionStyles.emptyText, { color: theme.colors.textTertiary }]}>
                  No albums yet
                </Text>
              }
              renderItem={({ item }) => {
                const isMember = pendingMemberIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={collectionStyles.row}
                    onPress={() => toggleCollection(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={item.isPublic ? "people-outline" : "folder-outline"}
                      size={18}
                      color={item.isPublic ? theme.colors.accentSecondary : theme.colors.textSecondary}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[collectionStyles.rowName, { color: theme.colors.text }]}>
                        {item.name}
                      </Text>
                      {item.isPublic && (
                        <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 1 }}>
                          Shared album
                        </Text>
                      )}
                    </View>
                    {isMember ? (
                      <View style={[collectionStyles.checkmark, { backgroundColor: theme.colors.accent }]}>
                        <Text style={collectionStyles.checkmarkText}>✓</Text>
                      </View>
                    ) : (
                      <View style={[collectionStyles.checkmarkEmpty, { borderColor: theme.colors.border }]} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={[collectionStyles.divider, { backgroundColor: theme.colors.border }]} />
              )}
            />
          )}

          <View style={[collectionStyles.divider, { backgroundColor: theme.colors.border }]} />

          {showingNewInput ? (
            <View style={[collectionStyles.newInputRow, collectionStyles.newInputInner]}>
              <TextInput
                style={[collectionStyles.newInputField, {
                  backgroundColor: theme.colors.backgroundInput,
                  color: theme.colors.text,
                }]}
                placeholder="Album name..."
                placeholderTextColor={theme.colors.placeholder}
                cursorColor={theme.colors.accent}
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                returnKeyType="done"
                onSubmitEditing={handleCreateCollection}
                maxLength={60}
                autoFocus
              />
              <TouchableOpacity
                style={[collectionStyles.createBtn, {
                  backgroundColor: theme.colors.buttonBg,
                  opacity: !newCollectionName.trim() || creatingCollection ? 0.5 : 1,
                }]}
                onPress={handleCreateCollection}
                disabled={!newCollectionName.trim() || creatingCollection}
                activeOpacity={0.7}
              >
                <Text style={[collectionStyles.createBtnText, { color: theme.colors.buttonText }]}>
                  {creatingCollection ? "..." : "Create"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={collectionStyles.row}
              onPress={() => setShowingNewInput(true)}
              activeOpacity={0.7}
            >
              <Text style={[collectionStyles.newCollectionText, { color: theme.colors.accent }]}>
                + New Album
              </Text>
            </TouchableOpacity>
          )}

          <View style={collectionStyles.saveRow}>
            <TouchableOpacity
              style={[collectionStyles.saveBtn, {
                backgroundColor: theme.colors.accent,
                opacity: savingCollections ? 0.6 : 1,
              }]}
              onPress={handleSaveCollections}
              disabled={savingCollections}
              activeOpacity={0.8}
            >
              <Text style={collectionStyles.saveBtnText}>
                {savingCollections ? "Saving…" : "Save Changes"}
              </Text>
            </TouchableOpacity>
          </View>
      </BottomSheet>
    </Animated.View>
    </GestureDetector>
  );
}

const collectionStyles = StyleSheet.create({
  list: {
    flexGrow: 0,
    maxHeight: 280,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowName: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    flex: 1,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "DMSans_700Bold",
  },
  checkmarkEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  newCollectionText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  newInputRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  newInputField: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  newInputInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  createBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
  },
  saveRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
});


function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    // ── Top bar + buttons ────────────────────────────────────────────────────
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    glassNav: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 10,
    },
    // These float over artwork and photos, so they keep a soft disc for
    // contrast (the "filled" case in the Phase 1 icon rules).
    glassBtn: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: theme.isDark ? "rgba(28,23,22,0.8)" : "rgba(255,255,255,0.82)",
      alignItems: "center",
      justifyContent: "center",
    },
    glassBtnRow: {
      flexDirection: "row",
      gap: 8,
    },
    // ── Hero ─────────────────────────────────────────────────────────────────
    photoHero: {
      flexShrink: 0,
    },
    photoCounterPill: {
      position: "absolute",
      bottom: 14,
      right: 14,
      backgroundColor: "rgba(20,18,24,0.55)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    photoCounterText: {
      fontSize: 12,
      fontFamily: theme.fonts.bodySemibold,
      fontVariant: ["tabular-nums"],
      color: "#FBF7F2",
    },
    ambientHero: {
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    heroVeil: {
      backgroundColor: theme.isDark ? "rgba(14,11,10,0.35)" : "rgba(251,247,242,0.3)",
    },
    artworkHero: {
      width: 232,
      height: 232,
      borderRadius: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
    },
    // ── Scroll body ──────────────────────────────────────────────────────────
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 80,
    },
    scrollBody: {
      paddingHorizontal: 24,
      paddingTop: 24,
      backgroundColor: theme.colors.background,
    },
    eyebrow: {
      fontSize: 12,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 4,
    },
    songRowText: {
      flex: 1,
      minWidth: 0,
    },
    artworkThumb: {
      width: 64,
      height: 64,
      borderRadius: 10,
    },
    songTitleHero: {
      fontFamily: theme.fonts.display,
      fontSize: 34,
      lineHeight: 38,
      letterSpacing: -0.3,
      color: theme.colors.text,
    },
    songTitleCompact: {
      fontSize: 26,
      lineHeight: 30,
    },
    artistLine: {
      fontSize: 15,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 6,
    },
    playerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 18,
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: 999,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    playButtonError: {
      backgroundColor: theme.colors.chipBg,
    },
    playHint: {
      fontSize: 14,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    progressTrackWrapper: {
      flex: 1,
      height: 28,
      justifyContent: "center",
    },
    progressTrack: {
      height: 3,
      backgroundColor: theme.colors.divider,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: 3,
      backgroundColor: theme.colors.text,
      borderRadius: 2,
    },
    progressTime: {
      fontSize: 13,
      fontFamily: theme.fonts.body,
      fontVariant: ["tabular-nums"],
      color: theme.colors.textSecondary,
    },
    contributor: {
      fontSize: 14,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      marginTop: 16,
    },
    // ── Reflection: the user's words, set to be read ─────────────────────────
    reflectionBlock: {
      marginTop: 26,
      gap: 16,
    },
    reflection: {
      fontFamily: theme.fonts.reading,
      fontSize: 19,
      lineHeight: 30,
      color: theme.colors.text,
    },
    metaBlock: {
      marginTop: 22,
      gap: 6,
    },
    metaLine: {
      fontSize: 14,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    moodWords: {
      fontSize: 11,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 1,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    photoStrip: {
      marginTop: 22,
      marginHorizontal: -24,
    },
    photoStripContent: {
      paddingHorizontal: 24,
      gap: 8,
    },
    photoStripThumb: {
      width: 96,
      height: 96,
      borderRadius: 10,
    },
    // ── Mini map ─────────────────────────────────────────────────────────────
    miniMapContainer: {
      height: 140,
      borderRadius: 12,
      overflow: "hidden",
      marginTop: 22,
    },
    miniMapHint: {
      position: "absolute",
      bottom: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: theme.colors.elevated,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    miniMapHintText: {
      fontSize: 12,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    shareMomentBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.colors.buttonBg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    shareMomentBtnText: {
      fontSize: 14,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.buttonText,
    },
    // ── Context menu ─────────────────────────────────────────────────────────
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
    },
    menuContainer: {
      position: "absolute",
      top: 56 + 36 + 12,
      right: 16,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      minWidth: 190,
      zIndex: 11,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 8,
      overflow: "hidden",
    },
    menuItem: {
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    menuItemText: {
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.text,
    },
    menuItemTextDestructive: {
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.destructive,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
  });
}

