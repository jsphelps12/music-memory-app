import { useState, useEffect, useMemo, useRef } from "react";
import * as Sentry from "@sentry/react-native";
import { usePostHog } from "posthog-react-native";
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ActionSheetIOS,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { extractExifFromPath } from "@/lib/photoMetadata";
import { saveMoment } from "@/lib/saveMoment";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { CollectionPicker } from "@/components/CollectionPicker";
import { CreateCollectionModal } from "@/components/CreateCollectionModal";
import { SongPickerSection } from "@/components/SongPickerSection";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { LocationField } from "@/components/LocationField";
import { fetchCollections } from "@/lib/collections";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song, Collection } from "@/types";
import { GeoResult } from "@/lib/geocoding";
import { friendlyError } from "@/lib/errors";
import { checkAndNotifyMilestone } from "@/lib/notifications";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { PromptPickerModal } from "@/components/PromptPickerModal";

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const scrollViewRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songAppleMusicId?: string;
    songDurationMs?: string;
    photos?: string;
    shareCandidates?: string;
    shareFailedUrl?: string;
    sharedPhotoPaths?: string;
    promptQuestion?: string;
    promptStarter?: string;
    collectionId?: string;
  }>();

  const [song, setSong] = useState<Song | null>(null);
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Sync song from params when returning from song-search with a share intent song
  useEffect(() => {
    if (params.songTitle) {
      setSong({
        id: params.songId ?? "",
        title: params.songTitle,
        artistName: params.songArtist ?? "",
        albumName: params.songAlbum ?? "",
        artworkUrl: params.songArtwork ?? "",
        appleMusicId: params.songAppleMusicId ?? "",
        durationMs: Number(params.songDurationMs) || 0,
      });
    }
  }, [params.songId]);

  // Handle Spotify cross-search candidates from share intent
  useEffect(() => {
    if (params.shareCandidates) {
      try {
        const parsed = JSON.parse(params.shareCandidates) as Song[];
        if (parsed.length > 1) {
          setCandidates(parsed);
          setShowCandidateModal(true);
        }
      } catch {}
    }
  }, [params.shareCandidates]);

  const [photos, setPhotos] = useState<string[]>([]);

  // If share intent lookup failed, open song search
  useEffect(() => {
    if (params.shareFailedUrl) {
      router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } });
    }
  }, [params.shareFailedUrl, photos, router]);

  // Restore photos from params after song-search navigation
  useEffect(() => {
    if (params.photos) {
      try {
        const restored = JSON.parse(params.photos) as string[];
        if (restored.length > 0) setPhotos(restored);
      } catch {}
    }
  }, [params.photos]);

  // Shared photos from share extension — pre-fill photos, open details, extract EXIF from first
  useEffect(() => {
    if (!params.sharedPhotoPaths) return;
    try {
      const paths = JSON.parse(params.sharedPhotoPaths) as string[];
      if (paths.length === 0) return;
      setPhotos(paths);
      setShowDetails(true);
      extractExifFromPath(paths[0]).then((meta) => {
        if (meta.date || meta.location) {
          setMetaSuggestion(meta);
          setDismissedMetaSuggestion(false);
        }
      });
    } catch {}
  }, [params.sharedPhotoPaths]);

  const hasSong = !!song;

  const [reflection, setReflection] = useState("");

  // Pre-fill reflection from a journal prompt
  useEffect(() => {
    if (params.promptStarter) {
      setReflection(params.promptStarter);
    }
  }, [params.promptStarter]);

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [metaSuggestion, setMetaSuggestion] = useState<{ date?: Date; location?: string; lat?: number; lng?: number } | null>(null);
  const [dismissedMetaSuggestion, setDismissedMetaSuggestion] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [createCollectionVisible, setCreateCollectionVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");
  const [peopleSuggestions, setPeopleSuggestions] = useState<string[]>([]);
  const [promptPickerVisible, setPromptPickerVisible] = useState(false);

  // Tag Friends
  const [taggedFriends, setTaggedFriends] = useState<Array<{ friend: import("@/types").Friendship; send: boolean }>>([]);
  const [availableFriends, setAvailableFriends] = useState<import("@/types").Friendship[]>([]);
  const [friendQuery, setFriendQuery] = useState("");

  useEffect(() => {
    if (showDetails && user && availableFriends.length === 0) {
      import("@/lib/friends").then(({ fetchFriends }) => {
        fetchFriends(user.id).then(setAvailableFriends).catch(() => {});
      });
    }
  }, [showDetails, user?.id]);

  useEffect(() => {
    if ((showDetails || params.collectionId) && user && collections.length === 0) {
      fetchCollections(user.id).then(setCollections).catch(() => {});
    }
  }, [showDetails, params.collectionId, user]);

  // Auto-expand details and pre-select collection when opened from a collection view
  useEffect(() => {
    if (params.collectionId) setShowDetails(true);
  }, [params.collectionId]);

  useEffect(() => {
    if (!params.collectionId || collections.length === 0) return;
    const match = collections.find((c) => c.id === params.collectionId);
    if (match) setSelectedCollection(match);
  }, [params.collectionId, collections]);

  useEffect(() => {
    if (showDetails && user && peopleSuggestions.length === 0) {
      supabase
        .from("moments")
        .select("people")
        .eq("user_id", user.id)
        .not("people", "is", null)
        .then(({ data }) => {
          if (!data) return;
          const names = [...new Set(data.flatMap((m) => m.people as string[]))].sort();
          setPeopleSuggestions(names);
        });
    }
  }, [showDetails, user]);

  const handleApplyMeta = (
    date: Date | undefined,
    location: { name: string; lat: number | null; lng: number | null } | undefined
  ) => {
    if (date) setMomentDate(date);
    if (location) setLocationResult(location);
    setDismissedMetaSuggestion(true);
    Haptics.selectionAsync();
  };

  const handleSelectCandidate = (selected: Song) => {
    Haptics.selectionAsync();
    setSong(selected);
    setCandidates([]);
    setShowCandidateModal(false);
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasSong) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please select a song.");
      return;
    }

    setError("");
    setLoading(true);
    if (!user) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      const { id: insertedId, secondaryFailures } = await saveMoment({
        userId: user.id,
        song: song!,
        reflection,
        photos,
        people,
        mood: selectedMood,
        locationResult,
        momentDate,
        selectedCollection,
        taggedFriends,
      });

      posthog.capture("moment_created", {
        song_title: song!.title,
        song_artist: song!.artistName,
        has_reflection: reflection.trim().length > 0,
        has_mood: Boolean(selectedMood),
        photo_count: photos.length,
        has_location: Boolean(locationResult),
        has_people: people.length > 0,
        has_collection: Boolean(selectedCollection),
      });

      checkAndNotifyMilestone(user.id).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (secondaryFailures.length > 0) {
        Alert.alert(
          "Moment saved",
          `Your moment was saved, but it ${secondaryFailures.join(" and ")}. Try again from the moment detail.`
        );
      }

      // Reset form
      setSong(null);
      setReflection("");
      setSelectedMood(null);
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setLocationResult(null);
      setSelectedCollection(null);
      setMetaSuggestion(null);
      setDismissedMetaSuggestion(false);
      setShowDetails(false);
      setError("");
      setTaggedFriends([]);
      setFriendQuery("");

      markTimelineStale();

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      Sentry.captureException(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Capture a Moment</Text>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} hitSlop={8}>
            <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <SongPickerSection song={song} onChange={setSong} photos={photos} />

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={[styles.reflectionInput, focusedField === "reflection" && { borderColor: theme.colors.accent }]}
          placeholder="What does this song remind you of? (optional)"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          multiline
          textAlignVertical="top"
          value={reflection}
          onChangeText={setReflection}
          onFocus={() => setFocusedField("reflection")}
          onBlur={() => setFocusedField("")}
        />

        {/* Prompt picker */}
        <TouchableOpacity
          style={styles.promptButton}
          activeOpacity={0.7}
          onPress={() => setPromptPickerVisible(true)}
        >
          <Text style={styles.promptButtonText}>Need a nudge? ✦</Text>
        </TouchableOpacity>

        {/* Details toggle */}
        <TouchableOpacity
          style={styles.detailsToggle}
          activeOpacity={0.7}
          onPress={() => {
            setShowDetails((v) => !v);
            Haptics.selectionAsync();
          }}
        >
          <Text style={styles.detailsToggleText}>
            {showDetails ? "Hide details ▲" : "Add details ▼"}
          </Text>
        </TouchableOpacity>

        {showDetails && (
          <>
            {/* Photos */}
            <Text style={styles.sectionLabel}>Photos</Text>
            <PhotoPickerSection
              photos={photos}
              onChange={setPhotos}
              onApplyMeta={handleApplyMeta}
            />

            {/* People */}
            <Text style={styles.sectionLabel}>People</Text>
            <PeopleInput people={people} onChange={setPeople} suggestions={peopleSuggestions} />

            {/* Tag Friends */}
            {availableFriends.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Tag Friends</Text>
                {taggedFriends.length > 0 && (
                  <View style={styles.taggedFriendsList}>
                    {taggedFriends.map((tf) => (
                      <View key={tf.friend.id} style={[styles.taggedFriendRow, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.taggedFriendName, { color: theme.colors.text }]} numberOfLines={1}>
                          {tf.friend.otherUserDisplayName ?? tf.friend.otherUserUsername ?? "Friend"}
                        </Text>
                        <View style={styles.taggedFriendActions}>
                          <Text style={[styles.sendLabel, { color: theme.colors.textSecondary }]}>Send</Text>
                          <TouchableOpacity
                            style={[styles.sendToggle, tf.send && { backgroundColor: theme.colors.accent }]}
                            onPress={() => setTaggedFriends((prev) =>
                              prev.map((f) => f.friend.id === tf.friend.id ? { ...f, send: !f.send } : f)
                            )}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.sendToggleThumb, tf.send && styles.sendToggleThumbOn]} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setTaggedFriends((prev) => prev.filter((f) => f.friend.id !== tf.friend.id))}
                            hitSlop={8}
                          >
                            <Text style={{ color: theme.colors.textTertiary, fontSize: 18, lineHeight: 20 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {availableFriends.filter((f) => !taggedFriends.find((tf) => tf.friend.id === f.id)).length > 0 && (
                  <>
                    <View style={[styles.friendSearchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}>
                      <Text style={[{ fontSize: 14, color: theme.colors.textSecondary, marginRight: 4 }]}>@</Text>
                      <TextInput
                        style={[{ flex: 1, fontSize: 14, color: theme.colors.text }]}
                        placeholder="Search friends…"
                        placeholderTextColor={theme.colors.placeholder}
                        value={friendQuery}
                        onChangeText={setFriendQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    {availableFriends
                      .filter((f) => {
                        if (taggedFriends.find((tf) => tf.friend.id === f.id)) return false;
                        if (!friendQuery.trim()) return false;
                        const q = friendQuery.toLowerCase();
                        return (f.otherUserDisplayName ?? "").toLowerCase().includes(q) ||
                          (f.otherUserUsername ?? "").toLowerCase().includes(q);
                      })
                      .slice(0, 5)
                      .map((friend) => (
                        <TouchableOpacity
                          key={friend.id}
                          style={[styles.friendResultRow, { borderBottomColor: theme.colors.border }]}
                          onPress={() => {
                            setTaggedFriends((prev) => [...prev, { friend, send: true }]);
                            setFriendQuery("");
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.friendResultName, { color: theme.colors.text }]}>
                            {friend.otherUserDisplayName ?? friend.otherUserUsername ?? "Friend"}
                          </Text>
                          {friend.otherUserUsername && (
                            <Text style={[styles.friendResultUsername, { color: theme.colors.textSecondary }]}>@{friend.otherUserUsername}</Text>
                          )}
                        </TouchableOpacity>
                      ))
                    }
                  </>
                )}
              </>
            )}

            {/* Mood selector */}
            <Text style={styles.sectionLabel}>Mood</Text>
            <MoodSelector
              selectedMood={selectedMood}
              onSelectMood={setSelectedMood}
              customMoods={profile?.customMoods ?? []}
              saveCustomMood={saveCustomMood}
              deleteCustomMood={deleteCustomMood}
            />

            {/* Collection */}
            <Text style={styles.sectionLabel}>Collection</Text>
            {selectedCollection ? (
              <View style={styles.collectionChipRow}>
                <TouchableOpacity
                  style={styles.collectionChip}
                  onPress={() => setCollectionPickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="folder-outline" size={14} color={theme.colors.accentText} />
                  <Text style={styles.collectionChipText}>{selectedCollection.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedCollection(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.collectionEmpty}
                onPress={() => setCollectionPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-outline" size={16} color={theme.colors.placeholder} />
                <Text style={styles.collectionEmptyText}>Add to collection</Text>
              </TouchableOpacity>
            )}

            {/* Date picker */}
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>Date</Text>
              {momentDate ? (
                <TouchableOpacity onPress={() => setMomentDate(null)} hitSlop={8}>
                  <Text style={styles.dateClearText}>Clear</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setMomentDate(new Date())} hitSlop={8}>
                  <Text style={styles.dateSetText}>Set date</Text>
                </TouchableOpacity>
              )}
            </View>
            {momentDate ? (
              <DateTimePicker
                value={momentDate}
                mode="date"
                display="compact"
                maximumDate={new Date()}
                onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) setMomentDate(date); }}
                themeVariant={theme.isDark ? "dark" : "light"}
                accentColor={theme.colors.accent}
                style={styles.datePicker}
              />
            ) : (
              <Text style={styles.noDateText}>No specific date</Text>
            )}

            {/* Location */}
            <Text style={styles.sectionLabel}>Location</Text>
            <LocationField value={locationResult} onChange={setLocationResult} detectCurrentLocation />
          </>
        )}

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>Save Moment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CollectionPicker
        visible={collectionPickerVisible}
        collections={collections}
        selectedId={selectedCollection?.id ?? null}
        onSelect={(c) => setSelectedCollection(c)}
        onClose={() => setCollectionPickerVisible(false)}
        onRequestCreate={() => {
          setCollectionPickerVisible(false);
          setCreateCollectionVisible(true);
        }}
      />

      {user ? (
        <CreateCollectionModal
          visible={createCollectionVisible}
          userId={user.id}
          onCreated={(collection) => {
            setCollections((prev) => [...prev, collection]);
            setSelectedCollection(collection);
            setCreateCollectionVisible(false);
          }}
          onClose={() => setCreateCollectionVisible(false)}
        />
      ) : null}

      <PromptPickerModal
        visible={promptPickerVisible}
        onSelect={(prompt) => setReflection(prompt)}
        onClose={() => setPromptPickerVisible(false)}
        customCategories={profile?.customPromptCategories ?? []}
      />

      {/* Spotify candidate selection modal */}
      <Modal
        visible={showCandidateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCandidateModal(false)}
      >
        <View style={styles.candidateModal}>
          <View style={styles.candidateHeader}>
            <Text style={styles.candidateTitle}>Select the right match</Text>
            <TouchableOpacity onPress={() => setShowCandidateModal(false)}>
              <Text style={styles.candidateClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.candidateSubtitle}>
            We found several Apple Music matches for this Spotify song.
          </Text>
          <FlatList
            data={candidates}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.candidateList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.candidateRow}
                activeOpacity={0.7}
                onPress={() => handleSelectCandidate(item)}
              >
                {item.artworkUrl ? (
                  <Image source={{ uri: item.artworkUrl }} style={styles.candidateArtwork} />
                ) : (
                  <ArtworkPlaceholder style={styles.candidateArtwork} />
                )}
                <View style={styles.candidateInfo}>
                  <Text style={styles.candidateSongTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.candidateArtist} numberOfLines={1}>{item.artistName}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing.xl,
      paddingTop: 80,
      paddingBottom: theme.spacing["4xl"],
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing["2xl"],
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    sectionLabel: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    reflectionInput: {
      height: 120,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    promptButton: {
      marginTop: theme.spacing.sm,
      alignSelf: "flex-start",
      paddingVertical: theme.spacing.xs,
    },
    promptButtonText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
    detailsToggle: {
      marginTop: theme.spacing.md,
      alignSelf: "center",
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
    },
    detailsToggleText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    dateClearText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
    },
    dateSetText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
    noDateText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.placeholder,
      paddingVertical: theme.spacing.sm,
    },
    datePicker: {
      alignSelf: "center",
    },
    error: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.lg,
    },
    saveButton: {
      height: 52,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing["2xl"],
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    // Collection picker UI
    collectionChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    collectionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.accentBg,
    },
    collectionChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
      fontWeight: theme.fontWeight.medium,
    },
    collectionEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: 8,
      marginBottom: theme.spacing.md,
    },
    collectionEmptyText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.placeholder,
    },
    // Candidate selection modal
    candidateModal: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: theme.spacing["2xl"],
    },
    candidateHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    candidateTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    candidateClose: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
    },
    candidateSubtitle: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
    },
    candidateList: {
      paddingHorizontal: theme.spacing.xl,
    },
    candidateRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    candidateArtwork: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    candidateInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    candidateSongTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    candidateArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    // Tag Friends
    taggedFriendsList: {
      gap: 8,
      marginBottom: 8,
    },
    taggedFriendRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: theme.radii.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    taggedFriendName: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    taggedFriendActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    sendLabel: {
      fontSize: theme.fontSize.xs,
    },
    sendToggle: {
      width: 38,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.border,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    sendToggleThumb: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#fff",
    },
    sendToggleThumbOn: {
      alignSelf: "flex-end",
    },
    friendSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      height: 38,
      marginBottom: 4,
    },
    friendResultRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    friendResultName: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    friendResultUsername: {
      fontSize: theme.fontSize.xs,
      marginTop: 1,
    },
  });
}
