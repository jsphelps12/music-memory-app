import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  KeyboardAvoidingView,
} from "react-native";
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
  fetchMomentCollectionIds,
  addMomentToCollection,
  removeMomentFromCollection,
  createCollection,
} from "@/lib/collections";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { PhotoViewer } from "@/components/PhotoViewer";
import { friendlyError } from "@/lib/errors";
import { Collection, Moment, MoodOption } from "@/types";

export default function MomentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentSong, isPlaying, play, pause, stop } = usePlayer();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moment, setMoment] = useState<Moment | null>(() => consumeCachedMoment());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Collection membership state
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showingNewInput, setShowingNewInput] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);

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

  const goBack = useCallback(() => router.back(), [router]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      translateX.value = e.translationX;
      opacity.value = Math.max(0, 1 - Math.abs(e.translationX) / 200);
    })
    .onEnd((e) => {
      "worklet";
      if (Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 400) {
        runOnJS(animateOut)(goBack);
      } else {
        translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const fetchMoment = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setError("");
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
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchMoment(moment === null);
      return () => {
        stop();
      };
    }, [fetchMoment, stop])
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

  const getMood = (value: MoodOption | null) =>
    value ? [...MOODS, ...(profile?.customMoods ?? [])].find((m) => m.value === value) : undefined;

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
      const [cols, ids] = await Promise.all([
        fetchCollections(user!.id),
        fetchMomentCollectionIds(id),
      ]);
      setAllCollections(cols);
      setMemberIds(ids);
    } catch {}
    setCollectionLoading(false);
  };

  const toggleCollection = async (collection: Collection) => {
    const isMember = memberIds.includes(collection.id);
    if (isMember) {
      setMemberIds((prev) => prev.filter((cid) => cid !== collection.id));
      try {
        await removeMomentFromCollection(collection.id, id);
      } catch {
        setMemberIds((prev) => [...prev, collection.id]);
      }
    } else {
      setMemberIds((prev) => [...prev, collection.id]);
      try {
        await addMomentToCollection(collection.id, id);
      } catch {
        setMemberIds((prev) => prev.filter((cid) => cid !== collection.id));
      }
    }
  };

  const handleCreateCollection = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || creatingCollection) return;
    setCreatingCollection(true);
    try {
      const collection = await createCollection(user!.id, trimmed);
      await addMomentToCollection(collection.id, id);
      setAllCollections((prev) => [...prev, collection]);
      setMemberIds((prev) => [...prev, collection.id]);
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

          animateOut(() => router.back());
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
              <TouchableOpacity style={styles.closeButton} onPress={() => animateOut(() => router.back())} activeOpacity={0.7}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.closeButton} onPress={() => animateOut(() => router.back())} activeOpacity={0.7}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEdit} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Edit Moment</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleAddToCollection} activeOpacity={0.7}>
              <Text style={styles.menuItemText}>Add to Collection</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete} activeOpacity={0.7}>
              <Text style={styles.menuItemTextDestructive}>Delete Moment</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {loading ? (
        <SkeletonMomentDetail />
      ) : error || !moment ? (
        <ErrorState
          message={error || "Moment not found"}
          onRetry={fetchMoment}
          onBack={() => animateOut(() => router.back())}
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
                <View style={[styles.artwork, styles.artworkPlaceholder]} />
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
            </View>
            {moment.songPreviewUrl ? (
              <TouchableOpacity
                style={styles.playButton}
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
                <Text style={styles.playButtonText}>
                  {isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId
                    ? "Pause"
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
              style={styles.photoGallery}
              contentContainerStyle={styles.photoGalleryContent}
            >
              {photoUrls.map((url, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    setViewerIndex(index);
                    setViewerVisible(true);
                  }}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.photoImage}
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
        </ScrollView>
      )}

      <PhotoViewer
        photos={photoUrls}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />

      {/* Collection membership modal */}
      <Modal
        visible={collectionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCollectionModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
                const isMember = memberIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={collectionStyles.row}
                    onPress={() => toggleCollection(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[collectionStyles.rowName, { color: theme.colors.text }]}>
                      {item.name}
                    </Text>
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
    fontWeight: "600",
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
    fontWeight: "500",
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
    fontWeight: "700",
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
    fontWeight: "500",
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
    fontWeight: "600",
  },
});

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
      fontWeight: theme.fontWeight.bold,
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
      top: 60 + 12 + 32 + 8, // headerPaddingTop + approx paddingBottom + button height + gap
      right: theme.spacing.xl,
      backgroundColor: theme.colors.cardBg,
      borderRadius: 14,
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
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.semibold,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 60,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.cardBg,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.xl,
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    songInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
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
    playButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    reflection: {
      fontSize: 17,
      color: theme.colors.text,
      lineHeight: 26,
      marginBottom: theme.spacing.xl,
    },
    photoGallery: {
      marginBottom: theme.spacing.xl,
      marginHorizontal: -theme.spacing.xl,
    },
    photoGalleryContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoImage: {
      width: 200,
      height: 200,
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
  });
}
