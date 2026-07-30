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
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
  TextInput,
  Linking,
  Share,
  InteractionManager,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
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
import { getPublicPhotoUrl, deleteMomentPhotos } from "@/lib/storage";
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
import { friendlyError } from "@/lib/errors";
import { Album, Moment, MoodOption, TaggedMoment } from "@/types";
import { markTimelineStale, markTimelineDeleted } from "@/lib/timelineRefresh";
import { invalidateMomentCaches, invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { ShareMomentSheet } from "@/components/ShareMomentSheet";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { fetchMyReaction, fetchReactionCount, addReaction, removeReaction } from "@/lib/reactions";
import { formatTime } from "@/lib/formatTime";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

export default function MomentDetailScreen() {
  const {
    id,
    returnTo,
    fromOnboarding,
    showShareSheet,
    taggedPersonName: taggedPersonNameParam,
    taggedPersonUserId: taggedPersonUserIdParam,
    collectionId,
    collectionRole,
    contributorName,
  } = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    fromOnboarding?: string;
    showShareSheet?: string;
    taggedPersonName?: string;
    taggedPersonUserId?: string;
    collectionId?: string;
    collectionRole?: string;
    contributorName?: string;
  }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentSong, isPlaying, playbackTime, playbackDuration, playError, playFull, pause, resume, seekTo } = usePlayer();
  const theme = useTheme();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  // Onboarding share sheet — auto-opens when showShareSheet=true
  const [onboardingShareSheetVisible, setOnboardingShareSheetVisible] = useState(false);
  const [showVolumeHint, setShowVolumeHint] = useState(true);
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
  // Resonance
  const [hasReacted, setHasReacted] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [reactingInFlight, setReactingInFlight] = useState(false);
  const [friendTags, setFriendTags] = useState<TaggedMoment[]>([]);

  const [origin] = useState(() => consumeCardOrigin());
  const translateX = useSharedValue(origin.active ? origin.x : 0);
  const translateY = useSharedValue(origin.active ? origin.y : 0);
  const scaleAnim = useSharedValue(origin.active ? origin.scale : 1);
  const opacity = useSharedValue(origin.active ? 0 : 1);

  const collectionTranslateY = useSharedValue(0);
  const collectionPanGesture = useMemo(() => Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) collectionTranslateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) { runOnJS(setCollectionModalVisible)(false); }
      collectionTranslateY.value = withTiming(0);
    }),
  [collectionTranslateY]);
  const collectionAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: collectionTranslateY.value }] }));

  // Hoisted from below: exitToCelebration must be declared before
  // onboardingSharePanGesture or the worklet captures undefined (TDZ crash).
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

  const exitToCelebration = useCallback(() => {
    setOnboardingShareSheetVisible(false);
    setTimeout(() => animateOut(goBack), 300);
  }, [animateOut, goBack]);

  const onboardingShareTranslateY = useSharedValue(0);
  const onboardingSharePanGesture = useMemo(() => Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) onboardingShareTranslateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) { runOnJS(exitToCelebration)(); }
      onboardingShareTranslateY.value = withTiming(0);
    }),
  [exitToCelebration, onboardingShareTranslateY]);
  const onboardingShareAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: onboardingShareTranslateY.value }] }));

  useEffect(() => {
    const config = { duration: 320, easing: Easing.out(Easing.cubic) };
    opacity.value = withTiming(1, { duration: 180 });
    translateX.value = withTiming(0, config);
    translateY.value = withTiming(0, config);
    scaleAnim.value = withTiming(1, config);
  }, []);

  useEffect(() => {
    if (fromOnboarding !== "true") return;
    const t = setTimeout(() => setShowVolumeHint(false), 6000);
    return () => clearTimeout(t);
  }, [fromOnboarding]);

  // Auto-open the share sheet after the entrance animation completes.
  useEffect(() => {
    if (showShareSheet !== "true") return;
    const t = setTimeout(() => setOnboardingShareSheetVisible(true), 450);
    return () => clearTimeout(t);
  }, [showShareSheet]);

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

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([40, Infinity])
        .failOffsetY([-15, 15])
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
    [animateOut, goBack]
  );

  const seekGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-5, 5])
        .failOffsetY([-10, 10])
        .onBegin((e) => { runOnJS(handleProgressSeek)(e.x); })
        .onUpdate((e) => { runOnJS(handleProgressSeek)(e.x); })
        .blocksExternalGesture(swipeGesture),
    [handleProgressSeek, swipeGesture]
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
      // PGRST116 = 0 rows — may be a tagged moment owned by another user; try RPC
      if (fetchError.code === "PGRST116") {
        const { data: rpcData } = await supabase
          .rpc("get_tagged_moment_data", { p_moment_ids: [id] });
        if (rpcData && rpcData.length > 0) {
          setMoment(mapRowToMoment(rpcData[0]));
          setLoading(false);
          return;
        }
      }
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

  // Load friend tags for own moments
  useEffect(() => {
    if (!moment || !user || moment.userId !== user.id) return;
    import("@/lib/friends").then(({ fetchTagsOnMoment }) => {
      fetchTagsOnMoment(moment.id).then(setFriendTags).catch(() => {});
    });
  }, [moment?.id, user?.id]);

  // Load reaction state
  useEffect(() => {
    if (!moment || !user) return;
    if (moment.userId !== user.id) {
      // Non-owner: check if current user has reacted
      fetchMyReaction(moment.id).then(setHasReacted).catch(() => {});
    } else {
      // Owner: fetch total reaction count
      fetchReactionCount(moment.id).then(setReactionCount).catch(() => {});
    }
  }, [moment?.id, user?.id]);

  const handleResonance = useCallback(async () => {
    if (!moment || !user || reactingInFlight) return;
    const next = !hasReacted;
    setHasReacted(next);
    Haptics.impactAsync(next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setReactingInFlight(true);
    try {
      if (next) {
        await addReaction(moment.id, user.id);
        // Fire-and-forget push to owner
        supabase.functions.invoke("notify-friend", {
          body: { toUserId: moment.userId, type: "moment_resonated", payload: { momentId: moment.id, songTitle: moment.songTitle } },
        }).catch(() => {});
      } else {
        await removeReaction(moment.id, user.id);
      }
    } catch {
      // Revert optimistic update on failure
      setHasReacted(!next);
    } finally {
      setReactingInFlight(false);
    }
  }, [moment, user, hasReacted, reactingInFlight]);

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
  const getMood = useCallback((value: MoodOption | null) =>
    value ? allMoods.find((m) => m.value === value) : undefined, [allMoods]);

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

  const handleDelete = () => {
    if (deleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    Alert.alert("Delete Moment", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          const { error: deleteError } = await supabase
            .from("moments")
            .delete()
            .eq("id", id);

          if (deleteError) {
            setDeleting(false);
            Alert.alert("Error", friendlyError(deleteError));
            return;
          }

          // Row is gone — now remove the objects, or they stay publicly
          // readable at their deterministic URLs forever.
          if (moment) {
            void deleteMomentPhotos(moment.photoUrls, moment.photoThumbnails);
          }

          posthog.capture("moment_deleted", { song_title: moment?.songTitle ?? null, song_artist: moment?.songArtist ?? null });
          markTimelineDeleted(id);
          invalidateMomentCaches(queryClient, user?.id);
          animateOut(goBack);
        },
      },
    ]);
  };

  const handleRemoveFromCollection = () => {
    if (!collectionId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    Alert.alert("Remove from Album", "Remove this moment from the album? The moment won't be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
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
        },
      },
    ]);
  };

  const mood = moment ? getMood(moment.mood) : undefined;

  const hasPhotos = photoUrls.length > 0;

  const formatEyebrow = (dateStr: string | null, location: string | null) => {
    const parts: string[] = [];
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase());
    }
    if (location) parts.push(location.toUpperCase());
    return parts.join(" · ");
  };

  const momentSongId = moment?.songSpotifyId ?? moment?.songAppleMusicId;
  const playingSongId = currentSong?.spotifyId ?? currentSong?.appleMusicId;
  const isCurrentSong = isPlaying && !!momentSongId && momentSongId === playingSongId;
  const playLabel = isCurrentSong ? "Pause" : playError ? "Unavailable" : "Play";

  return (
    <GestureDetector gesture={swipeGesture}>
    <Animated.View style={[styles.container, animStyle]}>
      {/* Ambient blurred artwork backdrop */}
      {moment?.songArtworkUrl ? (
        <AppImage
          source={{ uri: moment.songArtworkUrl }}
          style={StyleSheet.absoluteFill}
          blurRadius={50}
          contentFit="cover"
        />
      ) : null}
      <LinearGradient
        colors={["transparent", theme.isDark ? "rgba(13,10,8,0.55)" : "rgba(251,246,241,0.55)", theme.colors.background]}
        locations={[0, 0.4, 0.75]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Glass nav — always visible */}
      <View style={styles.glassNav}>
        <TouchableOpacity style={styles.glassBtn} onPress={() => animateOut(goBack)} activeOpacity={0.8} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
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
        <>
          {/* Hero section */}
          {hasPhotos ? (
            <View style={styles.photoHero}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
                style={StyleSheet.absoluteFill}
              >
                <AppImage source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </TouchableOpacity>
              <LinearGradient
                colors={["transparent", "rgba(15,13,11,0.88)"]}
                locations={[0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {photoUrls.length > 1 && (
                <View style={styles.photoCounterPill}>
                  <Text style={styles.photoCounterText}>{photoUrls.length} PHOTOS</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.ambientHero}>
              {moment.songArtworkUrl ? (
                <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkHero} contentFit="cover" />
              ) : (
                <ArtworkPlaceholder style={styles.artworkHero} />
              )}
            </View>
          )}

          {/* Scrollable content */}
          <ScrollView
            style={[styles.scrollView, !hasPhotos && { marginTop: 0 }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Small artwork thumbnail — only shown in photo-first layout */}
            {hasPhotos && moment.songArtworkUrl ? (
              <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkThumb} contentFit="cover" />
            ) : null}

            {/* Date + location eyebrow */}
            {(moment.momentDate || moment.location) ? (
              <Text style={styles.eyebrow}>
                {formatEyebrow(moment.momentDate, moment.location)}
              </Text>
            ) : null}

            {/* Song title (serif) */}
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => router.push({ pathname: "/song", params: { title: moment.songTitle, artist: moment.songArtist } })}
            >
              <Text style={styles.songTitleHero} numberOfLines={2}>{moment.songTitle}</Text>
            </TouchableOpacity>

            {/* Artist */}
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => router.push({ pathname: "/artist", params: { name: moment.songArtist } })}
            >
              <Text style={styles.artistHero}>{moment.songArtist}</Text>
            </TouchableOpacity>

            {/* Album */}
            {moment.songAlbumName ? (
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => router.push({ pathname: "/album", params: { album: moment.songAlbumName, artist: moment.songArtist } })}
              >
                <Text style={styles.albumHero}>{moment.songAlbumName}</Text>
              </TouchableOpacity>
            ) : null}

            {/* Play pill */}
            {(moment.songAppleMusicId || moment.songSpotifyId) ? (
              <TouchableOpacity
                style={[styles.playPill, playError && styles.playPillError]}
                activeOpacity={0.7}
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
                  size={13}
                  color={playError ? theme.colors.textTertiary : theme.colors.buttonText}
                />
                <Text style={[styles.playPillText, playError && styles.playPillTextError]}>
                  {playLabel}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Progress bar */}
            {isCurrentSong && playbackDuration > 0 && (
              <View style={styles.progressContainer}>
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
              </View>
            )}

            {/* Contributor */}
            {(contributorName || moment.contributorName) ? (
              <Text style={styles.contributor} numberOfLines={1}>
                by {contributorName || moment.contributorName}
              </Text>
            ) : null}

            {/* Reflection — pull-quote treatment */}
            {moment.reflectionText ? (
              <View style={styles.reflectionContainer}>
                <Text style={styles.quoteGlyph}>"</Text>
                <Text style={styles.reflection}>{moment.reflectionText}</Text>
              </View>
            ) : null}

            {/* Chips (dark pill style) */}
            {(mood || moment.people.length > 0 || moment.weatherCondition) ? (
              <View style={styles.chipsRow}>
                {mood ? (
                  <View style={styles.darkChip}>
                    <Text style={styles.darkChipText}>{mood.emoji} {mood.label}</Text>
                  </View>
                ) : null}
                {moment.people.map((person) => (
                  <View key={person} style={styles.darkChip}>
                    <Text style={styles.darkChipText}>👥 {person}</Text>
                  </View>
                ))}
                {moment.weatherCondition ? (
                  <View style={styles.darkChip}>
                    <Text style={styles.darkChipText}>
                      {moment.weatherCondition}{moment.weatherTempF != null ? ` · ${moment.weatherTempF}°F` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Time of day */}
            {moment.timeOfDay ? (
              <Text style={styles.timeOfDay}>{moment.timeOfDay}</Text>
            ) : null}

            {/* Mini map */}
            {moment.locationLat != null && moment.locationLng != null ? (
              <TouchableOpacity
                style={styles.miniMapContainer}
                activeOpacity={0.85}
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

            {/* Additional photos (when >1 photo, shown below reflection as cinematic grid) */}
            {hasPhotos && photoUrls.length > 1 && (
              <View style={styles.photoGrid}>
                <Text style={styles.photoGridLabel}>{photoUrls.length} PHOTOS · TAP TO VIEW</Text>
                <View style={styles.photoGridRow}>
                  <TouchableOpacity
                    style={[styles.photoGridMain, { marginRight: 6 }]}
                    activeOpacity={0.85}
                    onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
                  >
                    <AppImage source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                  </TouchableOpacity>
                  <View style={styles.photoGridStack}>
                    {photoUrls.slice(1, 3).map((url, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.photoGridSmall, idx === 0 && { marginBottom: 6 }]}
                        activeOpacity={0.85}
                        onPress={() => { setViewerIndex(idx + 1); setViewerVisible(true); }}
                      >
                        <AppImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
            {/* Single photo shown below reflection */}
            {hasPhotos && photoUrls.length === 1 && (
              <TouchableOpacity
                style={styles.singlePhoto}
                activeOpacity={0.85}
                onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
              >
                <AppImage source={{ uri: photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              </TouchableOpacity>
            )}

            {/* Shared with — owner only */}
            {user && moment.userId === user.id && friendTags.length > 0 && (() => {
              const visible = friendTags.slice(0, 2);
              const overflow = friendTags.length - visible.length;
              return (
                <TouchableOpacity
                  style={styles.sharedWithRow}
                  activeOpacity={0.7}
                  onPress={() => setShareModalVisible(true)}
                >
                  <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.sharedWithLabel}>Shared with</Text>
                  {visible.map((tag) => (
                    <View key={tag.id} style={styles.sharedWithChip}>
                      <Text style={styles.sharedWithChipText} numberOfLines={1}>
                        {tag.taggerDisplayName ?? "Friend"}
                      </Text>
                    </View>
                  ))}
                  {overflow > 0 && (
                    <View style={styles.sharedWithChip}>
                      <Text style={styles.sharedWithChipText}>+{overflow} more</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })()}

            {/* Bottom action row */}
            <View style={styles.actionRow}>
              {user && moment.userId !== user.id && (
                <TouchableOpacity
                  style={[styles.resonanceGlass, hasReacted && styles.resonanceGlassActive]}
                  onPress={handleResonance}
                  activeOpacity={0.75}
                  hitSlop={12}
                >
                  {reactingInFlight ? (
                    <ActivityIndicator size="small" color={hasReacted ? theme.colors.accent : theme.colors.text} />
                  ) : (
                    <Ionicons
                      name={hasReacted ? "heart" : "heart-outline"}
                      size={20}
                      color={hasReacted ? theme.colors.accent : theme.colors.text}
                    />
                  )}
                </TouchableOpacity>
              )}
              {user && moment.userId === user.id && reactionCount > 0 && (
                <View style={styles.resonanceGlass}>
                  <Ionicons name="heart" size={18} color={theme.colors.accent} />
                </View>
              )}
            </View>
          </ScrollView>
        </>
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
          tags={friendTags}
          onClose={() => {
            setShareModalVisible(false);
            // If we arrived here from the onboarding share sheet, exit to celebration
            if (showShareSheet === "true") {
              setTimeout(() => animateOut(goBack), 300);
            }
          }}
        />
      )}

      {/* Onboarding: volume nudge banner */}
      {fromOnboarding === "true" && showVolumeHint && (
        <View style={styles.volumeHint} pointerEvents="none">
          <Ionicons name="volume-high-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.volumeHintText}>Turn up your volume to hear it</Text>
        </View>
      )}

      {/* Onboarding: share nudge card — hidden when the share sheet auto-opens */}
      {fromOnboarding === "true" && showShareSheet !== "true" && moment && (
        <View style={styles.onboardingShareCard}>
          <Ionicons name="gift-outline" size={18} color={theme.colors.accent} />
          <Text style={styles.onboardingShareText}>Tap <Text style={{ fontFamily: theme.fonts.bodyBold }}>•••</Text> above to give this memory to someone</Text>
        </View>
      )}

      {/* ── Onboarding share sheet ── */}
      {showShareSheet === "true" && moment && (() => {
        const personName = taggedPersonNameParam ?? "them";
        const isOnApp = Boolean(taggedPersonUserIdParam);
        const inviteUrl = profile?.friendInviteToken
          ? `https://soundtracks.app/friend/${profile.friendInviteToken}`
          : "https://soundtracks.app";

        return (
          <Modal
            visible={onboardingShareSheetVisible}
            transparent
            animationType="slide"
            onRequestClose={exitToCelebration}
          >
            {/* Tapping the backdrop exits to celebration */}
            <TouchableOpacity
              style={shareSheetStyles.backdrop}
              activeOpacity={1}
              onPress={exitToCelebration}
            />
            <GestureDetector gesture={onboardingSharePanGesture}>
              <Animated.View style={[shareSheetStyles.sheet, { backgroundColor: theme.colors.background }, onboardingShareAnimatedStyle]}>
              <View style={[shareSheetStyles.handle, { backgroundColor: theme.colors.border }]} />

              {/* Header row: title + X */}
              <View style={shareSheetStyles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[shareSheetStyles.title, { color: theme.colors.text }]}>
                    Share with {personName}?
                  </Text>
                  <Text style={[shareSheetStyles.sub, { color: theme.colors.textSecondary }]}>
                    They were part of this memory.
                  </Text>
                </View>
                <TouchableOpacity onPress={exitToCelebration} hitSlop={12} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Share options */}
              <View style={shareSheetStyles.optionsList}>
                {/* Create share card */}
                <TouchableOpacity
                  style={[shareSheetStyles.option, { borderColor: theme.colors.border }]}
                  onPress={() => {
                    setOnboardingShareSheetVisible(false);
                    setTimeout(() => setShareModalVisible(true), 300);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[shareSheetStyles.optionIcon, { backgroundColor: theme.colors.accentBg }]}>
                    <Ionicons name="image-outline" size={22} color={theme.colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[shareSheetStyles.optionTitle, { color: theme.colors.text }]}>Save as Image</Text>
                    <Text style={[shareSheetStyles.optionSub, { color: theme.colors.textSecondary }]}>A designed card for Stories or texting</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>

                {/* Share invite link */}
                <TouchableOpacity
                  style={[shareSheetStyles.option, { borderColor: theme.colors.border }]}
                  onPress={async () => {
                    setOnboardingShareSheetVisible(false);
                    try { await Share.share({ message: inviteUrl, url: inviteUrl }); } catch {}
                    setTimeout(() => animateOut(goBack), 300);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[shareSheetStyles.optionIcon, { backgroundColor: theme.colors.accentBg }]}>
                    <Ionicons name="link-outline" size={22} color={theme.colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[shareSheetStyles.optionTitle, { color: theme.colors.text }]}>Share invite link</Text>
                    <Text style={[shareSheetStyles.optionSub, { color: theme.colors.textSecondary }]}>Send via text, email or anywhere</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>

                {/* Send in app — greyed until person joins */}
                <View style={[shareSheetStyles.option, { borderColor: theme.colors.border, opacity: isOnApp ? 1 : 0.4 }]}>
                  <View style={[shareSheetStyles.optionIcon, { backgroundColor: theme.colors.chipBg }]}>
                    <Ionicons name="phone-portrait-outline" size={22} color={theme.colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[shareSheetStyles.optionTitle, { color: theme.colors.text }]}>Send in app</Text>
                    <Text style={[shareSheetStyles.optionSub, { color: theme.colors.textSecondary }]}>
                      {isOnApp ? `${personName} is on soundtracks` : `Available when ${personName} joins`}
                    </Text>
                  </View>
                </View>
              </View>
              </Animated.View>
            </GestureDetector>
          </Modal>
        );
      })()}

      {/* Collection membership modal */}
      <Modal
        visible={collectionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCollectionModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={collectionStyles.flex}
        >
        <Pressable
          style={collectionStyles.backdrop}
          onPress={() => setCollectionModalVisible(false)}
        />
        <Animated.View style={[collectionStyles.sheet, { backgroundColor: theme.colors.cardBg }, collectionAnimatedStyle]}>
          <GestureDetector gesture={collectionPanGesture}>
            <View
              style={[collectionStyles.handle, { backgroundColor: theme.colors.border }]}
              hitSlop={{ top: 12, bottom: 16, left: 120, right: 120 }}
            />
          </GestureDetector>
          <Text style={[collectionStyles.sheetTitle, { color: theme.colors.textSecondary }]}>
            Add to Album
          </Text>

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
        </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </Animated.View>
    </GestureDetector>
  );
}

const collectionStyles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    maxHeight: "60%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
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
    // ── Glass nav ────────────────────────────────────────────────────────────
    glassNav: {
      position: "absolute",
      top: 56,
      left: 16,
      right: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 10,
    },
    glassBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: theme.isDark ? "rgba(20,15,12,0.45)" : "rgba(255,255,255,0.45)",
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    glassBtnRow: {
      flexDirection: "row",
      gap: 8,
    },
    // ── Hero ─────────────────────────────────────────────────────────────────
    photoHero: {
      height: 320,
      flexShrink: 0,
    },
    photoCounterPill: {
      position: "absolute",
      top: 110,
      right: 16,
      backgroundColor: theme.isDark ? "rgba(20,15,12,0.5)" : "rgba(255,255,255,0.5)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    photoCounterText: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      letterSpacing: 0.8,
      color: theme.colors.text,
    },
    ambientHero: {
      height: 310,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 30,
    },
    artworkHero: {
      width: 200,
      height: 200,
      borderRadius: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.5,
      shadowRadius: 30,
    },
    // ── Scroll body ──────────────────────────────────────────────────────────
    scrollView: {
      flex: 1,
      marginTop: -40,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 80,
    },
    artworkThumb: {
      width: 52,
      height: 52,
      borderRadius: 8,
      marginBottom: 14,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      letterSpacing: 1.2,
      color: theme.colors.accent,
      marginBottom: 4,
      textTransform: "uppercase",
    },
    songTitleHero: {
      fontFamily: "DMSerifDisplay_400Regular",
      fontSize: 34,
      lineHeight: 36,
      color: theme.colors.text,
      marginTop: 4,
    },
    artistHero: {
      fontSize: 15,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      marginTop: 4,
      marginBottom: 2,
    },
    albumHero: {
      fontSize: 12,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
      marginBottom: 12,
    },
    playPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.colors.buttonBg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      alignSelf: "flex-start",
      marginTop: 12,
    },
    playPillError: {
      backgroundColor: theme.colors.border,
    },
    playPillText: {
      fontSize: 14,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.buttonText,
    },
    playPillTextError: {
      color: theme.colors.textTertiary,
    },
    progressContainer: {
      marginTop: 14,
      gap: 4,
    },
    progressTrackWrapper: {
      height: 28,
      justifyContent: "center",
    },
    progressTrack: {
      height: 2,
      backgroundColor: theme.colors.border,
      borderRadius: 1,
      overflow: "hidden",
    },
    progressFill: {
      height: 2,
      backgroundColor: theme.colors.accent,
      borderRadius: 1,
    },
    progressTime: {
      fontSize: 10,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
    },
    contributor: {
      fontSize: 12,
      color: theme.colors.accent,
      marginTop: 12,
      fontFamily: "DMSans_500Medium",
    },
    // ── Reflection ───────────────────────────────────────────────────────────
    reflectionContainer: {
      position: "relative",
      paddingTop: 34,
      paddingLeft: 8,
      marginTop: 20,
    },
    quoteGlyph: {
      position: "absolute",
      top: 10,
      left: -4,
      fontFamily: "DMSerifDisplay_400Regular",
      fontSize: 72,
      lineHeight: 72,
      color: theme.colors.accent,
      opacity: 0.5,
      zIndex: 0,
    },
    reflection: {
      fontFamily: "DMSerifDisplay_400Regular_Italic",
      fontSize: 20,
      lineHeight: 30,
      color: theme.colors.text,
      zIndex: 1,
    },
    // ── Chips ─────────────────────────────────────────────────────────────────
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 20,
    },
    darkChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    darkChipText: {
      fontSize: 12,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.text,
    },
    timeOfDay: {
      fontSize: 12,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      marginTop: 12,
    },
    // ── Mini map ─────────────────────────────────────────────────────────────
    miniMapContainer: {
      height: 140,
      borderRadius: 14,
      overflow: "hidden",
      marginTop: 16,
    },
    miniMapHint: {
      position: "absolute",
      bottom: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    miniMapHintText: {
      fontSize: 11,
      fontFamily: "DMSans_500Medium",
      color: "#fff",
    },
    // ── Photo grid ───────────────────────────────────────────────────────────
    photoGrid: {
      marginTop: 24,
    },
    photoGridLabel: {
      fontSize: 10,
      fontFamily: "DMSans_600SemiBold",
      letterSpacing: 1.4,
      color: theme.colors.textTertiary,
      marginBottom: 10,
      textTransform: "uppercase",
    },
    photoGridRow: {
      flexDirection: "row",
      gap: 6,
      height: 120,
    },
    photoGridMain: {
      flex: 2,
      borderRadius: 10,
      overflow: "hidden",
    },
    photoGridStack: {
      flex: 1,
      flexDirection: "column",
      gap: 6,
    },
    photoGridSmall: {
      flex: 1,
      borderRadius: 10,
      overflow: "hidden",
    },
    singlePhoto: {
      marginTop: 20,
      height: 200,
      borderRadius: 14,
      overflow: "hidden",
    },
    // ── Shared with ──────────────────────────────────────────────────────────
    sharedWithRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 20,
    },
    sharedWithLabel: {
      fontSize: 13,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.textSecondary,
    },
    sharedWithChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundTertiary,
    },
    sharedWithChipText: {
      fontSize: 12,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.text,
    },
    // ── Action row ───────────────────────────────────────────────────────────
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 32,
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
    resonanceGlass: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    resonanceGlassActive: {
      backgroundColor: "rgba(232,130,92,0.15)",
      borderColor: "rgba(232,130,92,0.3)",
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
    // ── Volume hint ──────────────────────────────────────────────────────────
    volumeHint: {
      position: "absolute",
      bottom: 100,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.isDark ? "rgba(30,25,22,0.85)" : "rgba(255,255,255,0.85)",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    volumeHintText: {
      fontSize: 13,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
    },
    // ── Onboarding share card ─────────────────────────────────────────────────
    onboardingShareCard: {
      position: "absolute",
      bottom: 48,
      left: 20,
      right: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.isDark ? "rgba(30,25,22,0.85)" : "rgba(255,255,255,0.85)",
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      pointerEvents: "none",
    },
    onboardingShareText: {
      flex: 1,
      fontSize: 16,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.text,
    },
  });
}

// ── Onboarding share sheet styles (static — no theme dependency) ───────────
const shareSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
    opacity: 0.4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    marginBottom: 3,
  },
  sub: {
    fontSize: 14,
  },
  optionsList: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 13,
  },
});
