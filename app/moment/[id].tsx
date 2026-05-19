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
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl } from "@/lib/storage";
import { mapRowToMoment } from "@/lib/moments";
import {
  fetchCollections,
  addMomentToCollection,
  removeMomentFromCollection,
  createCollection,
  readCollectionsCache,
} from "@/lib/collections";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { friendlyError } from "@/lib/errors";
import { Collection, Moment, MoodOption, TaggedMoment } from "@/types";
import { markTimelineStale, markTimelineDeleted } from "@/lib/timelineRefresh";
import { ShareMomentSheet } from "@/components/ShareMomentSheet";
import { CloseButton } from "@/components/CloseButton";
import { Ionicons } from "@expo/vector-icons";
import { fetchMyReaction, fetchReactionCount, addReaction, removeReaction } from "@/lib/reactions";

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
  const { currentSong, isPlaying, playError, play, pause, stop } = usePlayer();
  const theme = useTheme();
  const posthog = usePostHog();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moment, setMoment] = useState<Moment | null>(() => consumeCachedMoment());
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
  // Collection membership state
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
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

  const hasAutoPlayed = useRef(false);
  const momentRef = useRef(moment);
  momentRef.current = moment;
  useEffect(() => {
    if (hasAutoPlayed.current) return;
    const m = momentRef.current;
    if (!m?.songPreviewUrl) return;
    hasAutoPlayed.current = true;
    const timer = setTimeout(() => {
      const current = momentRef.current;
      if (!current?.songPreviewUrl) return;
      play(
        {
          id: current.songAppleMusicId,
          title: current.songTitle,
          artistName: current.songArtist,
          albumName: current.songAlbumName ?? "",
          artworkUrl: current.songArtworkUrl,
          appleMusicId: current.songAppleMusicId,
          durationMs: 0,
        },
        current.songPreviewUrl!
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

  // Used by the onboarding share sheet — closes the sheet then exits to
  // onboarding's celebration phase (which is the screen below after
  // create.tsx did router.replace to get here).
  const exitToCelebration = useCallback(() => {
    setOnboardingShareSheetVisible(false);
    // Small delay so the sheet slides down before animating out
    setTimeout(() => animateOut(goBack), 300);
  }, [animateOut, goBack]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([15, Infinity])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      "worklet";
      translateX.value = e.translationX;
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
    });

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
      const isFirstLoad = moment === null;
      const task = InteractionManager.runAfterInteractions(() => {
        fetchMoment(isFirstLoad);
      });
      return () => {
        task.cancel();
        stop();
      };
    }, [fetchMoment, stop])
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
      // Read from AsyncStorage cache — collections were already fetched by the timeline.
      // Only hit the network on a true cache miss.
      const cached = await readCollectionsCache(user!.id);
      const cols = cached ?? await fetchCollections(user!.id);

      // Derive which collections contain this moment from the momentIds already stored
      // on each collection — no second network call needed.
      const memberCollectionIds = cols
        .filter((c) => c.momentIds?.includes(id))
        .map((c) => c.id);

      setAllCollections(cols);
      setMemberIds(memberCollectionIds);
      setPendingMemberIds(memberCollectionIds);
    } catch {}
    setCollectionLoading(false);
  };

  const toggleCollection = (collection: Collection) => {
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
        ...toAdd.map((cid) => addMomentToCollection(cid, id, user!.id)),
        ...toRemove.map((cid) => removeMomentFromCollection(cid, id)),
      ]);
      setMemberIds(pendingMemberIds);
    } catch {}
    setSavingCollections(false);
    setCollectionModalVisible(false);
  };

  const handleCreateCollection = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || creatingCollection) return;
    setCreatingCollection(true);
    try {
      const collection = await createCollection(user!.id, trimmed);
      await addMomentToCollection(collection.id, id, user!.id);
      setAllCollections((prev) => [...prev, collection]);
      setMemberIds((prev) => [...prev, collection.id]);
      setPendingMemberIds((prev) => [...prev, collection.id]);
      setNewCollectionName("");
      setShowingNewInput(false);
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

          posthog.capture("moment_deleted", { song_title: moment?.songTitle ?? null, song_artist: moment?.songArtist ?? null });
          markTimelineDeleted(id);
          animateOut(goBack);
        },
      },
    ]);
  };

  const handleRemoveFromCollection = () => {
    if (!collectionId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setMenuOpen(false);
    Alert.alert("Remove from Collection", "Remove this moment from the collection? The moment won't be deleted.", [
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
          animateOut(goBack);
        },
      },
    ]);
  };

  const mood = moment ? getMood(moment.mood) : undefined;

  return (
    <GestureDetector gesture={swipeGesture}>
    <Animated.View style={[styles.container, animStyle]}>
      {moment?.songArtworkUrl ? (
        <>
          <Image
            source={{ uri: moment.songArtworkUrl }}
            style={StyleSheet.absoluteFill}
            blurRadius={50}
            contentFit="cover"
          />
          <View style={styles.backdrop} />
        </>
      ) : null}

      <View style={styles.headerRow}>
        {!loading && moment ? (
          <>
            {formatDate(moment.momentDate) ? (
              <Text style={styles.date}>{formatDate(moment.momentDate)}</Text>
            ) : (
              <Text style={[styles.date, styles.dateAbsent]}>No date</Text>
            )}
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.moreButton} onPress={openMenu} activeOpacity={0.7}>
                <Text style={styles.moreButtonText}>{"\u22EF"}</Text>
              </TouchableOpacity>
              <CloseButton onPress={() => animateOut(goBack)} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }} />
            <CloseButton onPress={() => animateOut(goBack)} />
          </>
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
                    <Text style={styles.menuItemText}>Add to Collection</Text>
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
                    <Text style={styles.menuItemTextDestructive}>Remove from Collection</Text>
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
        <SkeletonMomentDetail />
      ) : error || !moment ? (
        <ErrorState
          message={error || "Moment not found"}
          onRetry={() => fetchMoment(true)}
          onBack={() => animateOut(goBack)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Song row: artwork + title/artist + play */}
          <View style={styles.songRow}>
            <TouchableOpacity
              activeOpacity={moment.songAlbumName ? 0.7 : 1}
              onPress={() => {
                if (!moment.songAlbumName) return;
                router.push({ pathname: "/album", params: { album: moment.songAlbumName, artist: moment.songArtist } });
              }}
            >
              {moment.songArtworkUrl ? (
                <Image
                  source={{ uri: moment.songArtworkUrl }}
                  style={styles.artwork}
                />
              ) : (
                <ArtworkPlaceholder style={styles.artwork} />
              )}
            </TouchableOpacity>
            <View style={styles.songInfo}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => router.push({ pathname: "/song", params: { title: moment.songTitle, artist: moment.songArtist } })}
              >
                <Text style={[styles.songTitle, styles.songTitleLink]} numberOfLines={2}>
                  {moment.songTitle}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() =>
                  router.push({ pathname: "/artist", params: { name: moment.songArtist } })
                }
              >
                <Text style={[styles.songArtist, styles.songArtistLink]} numberOfLines={1}>
                  {moment.songArtist}
                </Text>
              </TouchableOpacity>
              {moment.songAlbumName ? (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => router.push({ pathname: "/album", params: { album: moment.songAlbumName, artist: moment.songArtist } })}
                >
                  <Text style={[styles.songAlbum, styles.songAlbumLink]} numberOfLines={1}>
                    {moment.songAlbumName}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {(contributorName || moment.contributorName) ? (
                <Text style={styles.contributor} numberOfLines={1}>
                  by {contributorName || moment.contributorName}
                </Text>
              ) : null}
            </View>
            {moment.songPreviewUrl ? (
              <TouchableOpacity
                style={[styles.playButton, playError && styles.playButtonError]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const isCurrentSong =
                    isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId;
                  if (isCurrentSong) {
                    pause();
                  } else {
                    play(
                      {
                        id: moment.songAppleMusicId,
                        title: moment.songTitle,
                        artistName: moment.songArtist,
                        albumName: moment.songAlbumName,
                        artworkUrl: moment.songArtworkUrl,
                        appleMusicId: moment.songAppleMusicId,
                        durationMs: 0,
                      },
                      moment.songPreviewUrl!
                    );
                  }
                }}
              >
                <Text style={[styles.playButtonText, playError && styles.playButtonErrorText]}>
                  {isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId
                    ? "Pause"
                    : playError
                    ? "Unavailable"
                    : "Play"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Reflection — the main content */}
          {moment.reflectionText ? (
            <Text style={styles.reflection}>{moment.reflectionText}</Text>
          ) : null}

          {/* Photos */}
          {photoUrls.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoStrip}
              contentContainerStyle={styles.photoStripContent}
            >
              {photoUrls.map((url, index) => (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.85}
                  onPress={() => {
                    setViewerIndex(index);
                    setViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.photoStripThumb}
                    contentFit="cover"
                    transition={200}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Metadata */}
          {(mood || moment.people.length > 0) && (
            <View style={styles.metaRow}>
              {mood ? (
                <View style={styles.moodChip}>
                  <Text style={styles.moodChipText}>
                    {mood.emoji} {mood.label}
                  </Text>
                </View>
              ) : null}
              {moment.people.map((person) => (
                <View key={person} style={styles.personChip}>
                  <Text style={styles.personChipText}>{person}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Location + time of day */}
          {(moment.location || moment.timeOfDay) ? (
            <View style={styles.locationRow}>
              {moment.location ? (
                <Text style={styles.locationText}>{moment.location}</Text>
              ) : null}
              {moment.timeOfDay ? (
                <Text style={styles.timeOfDayText}>{moment.timeOfDay}</Text>
              ) : null}
            </View>
          ) : null}

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
                <Ionicons name="people-outline" size={14} color={theme.colors.accentSecondary} />
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

        </ScrollView>
      )}

      {/* Resonance button — non-owners only */}
      {moment && user && moment.userId !== user.id && (
        <TouchableOpacity
          style={[styles.resonanceBtn, hasReacted && styles.resonanceBtnActive]}
          onPress={handleResonance}
          activeOpacity={0.75}
          hitSlop={12}
        >
          <Ionicons
            name={hasReacted ? "heart" : "heart-outline"}
            size={20}
            color={hasReacted ? "#E8825C" : theme.colors.textSecondary}
          />
        </TouchableOpacity>
      )}

      {/* Resonance indicator — owner only, shown when at least one person has resonated */}
      {moment && user && moment.userId === user.id && reactionCount > 0 && (
        <View style={styles.resonanceIndicator}>
          <Ionicons name="heart" size={16} color="#E8825C" />
        </View>
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
            <View style={[shareSheetStyles.sheet, { backgroundColor: theme.colors.background }]}>
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
            </View>
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
          style={[
            collectionStyles.backdrop,
            { backgroundColor: theme.isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" },
          ]}
          onPress={() => setCollectionModalVisible(false)}
        />
        <View style={[collectionStyles.sheet, { backgroundColor: theme.colors.cardBg }]}>
          <View style={[collectionStyles.handle, { backgroundColor: theme.colors.border }]} />
          <Text style={[collectionStyles.sheetTitle, { color: theme.colors.textSecondary }]}>
            Add to Collection
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
                  No collections yet
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
                          Shared collection
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
                placeholder="Collection name..."
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
                + New Collection
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
        </View>
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


const PHOTO_SIZE = 200;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.isDark ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.55)",
    },
    headerRow: {
      paddingTop: 60,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    date: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      flex: 1,
    },
    dateAbsent: {
      fontWeight: theme.fontWeight.normal,
      color: theme.colors.textTertiary,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    moreButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    moreButtonText: {
      fontSize: 18,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textSecondary,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 10,
    },
    menuContainer: {
      position: "absolute",
      top: 60 + 12 + 32 + 8,
      right: theme.spacing.xl,
      backgroundColor: theme.colors.cardBg,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      minWidth: 190,
      zIndex: 11,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
      overflow: "hidden",
    },
    menuItem: {
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
    },
    menuItemText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    menuItemTextDestructive: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 60,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.xl,
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    songInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    contributor: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.accent,
      marginTop: 2,
      fontFamily: theme.fonts.bodyMedium,
    },
    songTitleLink: {
      color: theme.colors.accent,
    },
    songArtistLink: {
      textDecorationLine: "underline",
    },
    songAlbum: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    songAlbumLink: {
      color: theme.colors.accent,
    },
    playButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.radii.lg,
      marginLeft: theme.spacing.sm,
    },
    playButtonError: {
      backgroundColor: theme.colors.backgroundSecondary,
    },
    playButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
    },
    playButtonErrorText: {
      color: theme.colors.textTertiary,
    },
    reflection: {
      fontSize: 18,
      fontFamily: theme.fonts.displayItalic,
      color: theme.colors.text,
      lineHeight: 28,
      marginBottom: theme.spacing.xl,
    },
    photoStrip: {
      marginBottom: theme.spacing.xl,
      marginHorizontal: -theme.spacing.xl,
      height: PHOTO_SIZE,
    },
    photoStripContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoStripThumb: {
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
      borderRadius: theme.radii.md,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing["3xl"],
    },
    moodChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.chipBg,
    },
    moodChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    personChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentBg,
    },
    personChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing["3xl"],
    },
    sharedWithRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing["3xl"],
    },
    sharedWithLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentSecondary,
      fontFamily: theme.fonts.bodyMedium,
    },
    sharedWithChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accentSecondary,
      backgroundColor: theme.colors.accentSecondaryBg,
    },
    sharedWithChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentSecondaryText,
    },
    locationText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    timeOfDayText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginLeft: theme.spacing.sm,
    },
    resonanceBtn: {
      position: "absolute",
      bottom: 48,
      left: theme.spacing.xl,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    resonanceBtnActive: {
      backgroundColor: theme.colors.accentBg,
    },
    resonanceIndicator: {
      position: "absolute",
      bottom: 48,
      left: theme.spacing.xl,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.accentBg,
      alignItems: "center",
      justifyContent: "center",
    },
    volumeHint: {
      position: "absolute",
      bottom: 100,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.colors.backgroundInput,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      opacity: 0.9,
    },
    volumeHintText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    onboardingShareCard: {
      position: "absolute",
      bottom: 48,
      left: theme.spacing.xl,
      right: theme.spacing.xl,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      pointerEvents: "none",
    },
    onboardingShareText: {
      flex: 1,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      fontWeight: theme.fontWeight.medium,
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
