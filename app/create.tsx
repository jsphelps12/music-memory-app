import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as Sentry from "@sentry/react-native";
import { usePostHog } from "posthog-react-native";
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  ActionSheetIOS,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAuth } from "@/contexts/AuthContext";
import { extractExifFromPath } from "@/lib/photoMetadata";
import { saveMoment } from "@/lib/saveMoment";
import { maybeRequestReview } from "@/lib/reviewPrompt";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { VisibilityPicker, Visibility } from "@/components/VisibilityPicker";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumModal } from "@/components/CreateAlbumModal";
import { SongPickerSection } from "@/components/SongPickerSection";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { LocationField } from "@/components/LocationField";
import { fetchAlbums } from "@/lib/albums";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song, Album } from "@/types";
import { GeoResult } from "@/lib/geocoding";
import { friendlyError } from "@/lib/errors";
import { checkAndNotifyMilestone } from "@/lib/notifications";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { fetchPreviewUrl } from "@/lib/musickit";
import { PromptPickerModal } from "@/components/PromptPickerModal";
import { fetchWeather, WeatherResult } from "@/lib/weather";
import { dateToStr } from "@/lib/dateUtils";

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
  const previewFetchRef = useRef<Promise<{ previewUrl: string | null; albumName: string | null }> | null>(null);

  const handleSongChange = useCallback((s: Song | null) => {
    setSong(s);
    previewFetchRef.current = s ? fetchPreviewUrl(s.appleMusicId) : null;
  }, []);
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Sync song from params when returning from song-search with a share intent song
  useEffect(() => {
    if (params.songTitle) {
      handleSongChange({
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
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [weatherResult, setWeatherResult] = useState<WeatherResult | null>(null);
  const [metaSuggestion, setMetaSuggestion] = useState<{ date?: Date; location?: string; lat?: number; lng?: number } | null>(null);
  const [dismissedMetaSuggestion, setDismissedMetaSuggestion] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumPickerVisible, setAlbumPickerVisible] = useState(false);
  const [createAlbumVisible, setCreateAlbumVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");
  const [promptPickerVisible, setPromptPickerVisible] = useState(false);

  // Tag Friends
  const [taggedFriends, setTaggedFriends] = useState<Array<{ friend: import("@/types").Friendship; send: boolean }>>([]);
  const [availableFriends, setAvailableFriends] = useState<import("@/types").Friendship[]>([]);

  useEffect(() => {
    if (showDetails && user && availableFriends.length === 0) {
      import("@/lib/friends").then(({ fetchFriends }) => {
        fetchFriends(user.id).then(setAvailableFriends).catch(() => {});
      });
    }
  }, [showDetails, user?.id]);

  useEffect(() => {
    if ((showDetails || params.collectionId) && user && albums.length === 0) {
      fetchAlbums(user.id).then(setAlbums).catch(() => {});
    }
  }, [showDetails, params.collectionId, user]);

  // Auto-expand details and pre-select album when opened from an album view
  useEffect(() => {
    if (params.collectionId) setShowDetails(true);
  }, [params.collectionId]);

  useEffect(() => {
    if (!params.collectionId || albums.length === 0) return;
    const match = albums.find((c) => c.id === params.collectionId);
    if (match) setSelectedAlbum(match);
  }, [params.collectionId, albums]);

  // Auto-fetch weather when location + date are both set
  useEffect(() => {
    if (!locationResult?.lat || !locationResult?.lng || !momentDate) {
      setWeatherResult(null);
      return;
    }
    let cancelled = false;
    const d = momentDate;
    const dateStr = dateToStr(d);
    const hour = new Date().getHours();
    const tod =
      hour >= 5 && hour < 12 ? "Morning" :
      hour >= 12 && hour < 17 ? "Afternoon" :
      hour >= 17 && hour < 21 ? "Evening" : "Late Night";
    fetchWeather(locationResult.lat, locationResult.lng, dateStr, tod).then((result) => {
      if (!cancelled) setWeatherResult(result);
    });
    return () => { cancelled = true; };
  }, [locationResult?.lat, locationResult?.lng, momentDate?.toDateString()]);

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
    handleSongChange(selected);
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
      const prefetchedPreview = previewFetchRef.current
        ? await previewFetchRef.current.catch(() => null)
        : undefined;
      const { id: insertedId, moment: savedMoment, secondaryFailures } = await saveMoment({
        userId: user.id,
        song: song!,
        reflection,
        photos,
        people,
        mood: selectedMood,
        locationResult,
        momentDate,
        visibility,
        selectedAlbum,
        taggedFriends,
        prefetchedPreview,
        weatherResult,
      });

      posthog.capture("moment_created", {
        song_title: song!.title,
        song_artist: song!.artistName,
        has_reflection: reflection.trim().length > 0,
        has_mood: Boolean(selectedMood),
        photo_count: photos.length,
        has_location: Boolean(locationResult),
        has_people: people.length > 0,
        has_collection: Boolean(selectedAlbum),
      });

      checkAndNotifyMilestone(user.id).catch(() => {});
      maybeRequestReview().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (secondaryFailures.length > 0) {
        Alert.alert(
          "Moment saved",
          `Your moment was saved, but ${secondaryFailures.join(" and ")}. You can retry from the moment detail.`
        );
      }

      // Reset form
      handleSongChange(null);
      setReflection("");
      setSelectedMood(null);
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setLocationResult(null);
      setSelectedAlbum(null);
      setVisibility('private');
      setWeatherResult(null);
      setMetaSuggestion(null);
      setDismissedMetaSuggestion(false);
      setShowDetails(false);
      setError("");
      setTaggedFriends([]);

      markTimelineStale(savedMoment);

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
      behavior="padding"
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
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <SongPickerSection song={song} onChange={handleSongChange} photos={photos} />

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={[styles.reflectionInput, focusedField === "reflection" && { borderColor: theme.colors.accent }]}
          placeholder="What does this song remind you of? (optional)"
          placeholderTextColor="rgba(255,255,255,0.3)"
          cursorColor={theme.colors.accent}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
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
            <PeopleInput
              people={people}
              onChangePeople={setPeople}
              taggedFriends={taggedFriends}
              onChangeTaggedFriends={setTaggedFriends}
              friends={availableFriends}
            />

            {/* Visibility */}
            <Text style={styles.sectionLabel}>
              {selectedAlbum?.isPublic ? "Who else can see this" : "Who can see this"}
            </Text>
            <VisibilityPicker value={visibility} onChange={setVisibility} />

            {/* Mood selector */}
            <Text style={styles.sectionLabel}>Mood</Text>
            <MoodSelector
              selectedMood={selectedMood}
              onSelectMood={setSelectedMood}
              customMoods={profile?.customMoods ?? []}
              saveCustomMood={saveCustomMood}
              deleteCustomMood={deleteCustomMood}
            />

            {/* Album */}
            <Text style={styles.sectionLabel}>Album</Text>
            {selectedAlbum ? (
              <>
                <View style={styles.collectionChipRow}>
                  <TouchableOpacity
                    style={[
                      styles.collectionChip,
                      selectedAlbum.isPublic && { borderColor: "rgba(152,136,200,0.3)", backgroundColor: "rgba(107,95,140,0.15)" },
                    ]}
                    onPress={() => setAlbumPickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={selectedAlbum.isPublic ? "people-outline" : "folder-outline"}
                      size={14}
                      color={selectedAlbum.isPublic ? "#9888C8" : "rgba(255,255,255,0.75)"}
                    />
                    <Text style={[
                      styles.collectionChipText,
                      selectedAlbum.isPublic && { color: "#9888C8" },
                    ]}>
                      {selectedAlbum.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedAlbum(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                </View>
                {selectedAlbum.isPublic && (
                  <Text style={styles.collectionHint}>
                    All album members can see this. "Who else can see this" controls access outside the album.
                  </Text>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={styles.collectionEmpty}
                onPress={() => setAlbumPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-outline" size={16} color="rgba(255,255,255,0.35)" />
                <Text style={styles.collectionEmptyText}>Add to album</Text>
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

            {/* Weather chip — silently appears once auto-fetched */}
            {weatherResult ? (
              <View style={styles.collectionChipRow}>
                <View style={styles.collectionChip}>
                  <Text style={styles.collectionChipText}>
                    {weatherResult.condition} · {weatherResult.tempF}°F
                  </Text>
                </View>
              </View>
            ) : null}
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

      <AlbumPicker
        visible={albumPickerVisible}
        collections={albums}
        selectedId={selectedAlbum?.id ?? null}
        onSelect={(a) => setSelectedAlbum(a)}
        onClose={() => setAlbumPickerVisible(false)}
        onRequestCreate={() => {
          setAlbumPickerVisible(false);
          setCreateAlbumVisible(true);
        }}
      />

      {user ? (
        <CreateAlbumModal
          visible={createAlbumVisible}
          userId={user.id}
          onCreated={(album) => {
            setAlbums((prev) => [...prev, album]);
            setSelectedAlbum(album);
            setCreateAlbumVisible(false);
          }}
          onClose={() => setCreateAlbumVisible(false)}
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

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#0F0D0B",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 60,
      paddingBottom: 40,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontFamily: "DMSerifDisplay_400Regular",
      color: "#fff",
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      color: "rgba(255,255,255,0.45)",
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginTop: 24,
      marginBottom: 8,
    },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 24,
      marginBottom: 8,
    },
    reflectionInput: {
      height: 120,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.10)",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 16,
      color: "#fff",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    promptButton: {
      marginTop: 8,
      alignSelf: "flex-start",
      paddingVertical: 4,
    },
    promptButtonText: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.35)",
    },
    detailsToggle: {
      marginTop: 12,
      alignSelf: "center",
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    detailsToggleText: {
      fontSize: 14,
      fontFamily: "DMSans_500Medium",
      color: "#E8825C",
    },
    dateClearText: {
      fontSize: 14,
      color: "#FF453A",
    },
    dateSetText: {
      fontSize: 14,
      color: "#E8825C",
    },
    noDateText: {
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.35)",
      paddingVertical: 8,
    },
    datePicker: {
      alignSelf: "center",
    },
    error: {
      color: "#FF453A",
      fontSize: 14,
      marginTop: 16,
    },
    saveButton: {
      height: 52,
      backgroundColor: "#fff",
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: "#0F0D0B",
      fontSize: 16,
      fontFamily: "DMSans_600SemiBold",
    },
    // Collection picker UI
    collectionChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    collectionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },
    collectionChipText: {
      fontSize: 14,
      fontFamily: "DMSans_500Medium",
      color: "rgba(255,255,255,0.85)",
    },
    collectionHint: {
      fontSize: 12,
      color: "rgba(255,255,255,0.45)",
      marginTop: 4,
      marginBottom: 8,
    },
    collectionEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      marginBottom: 12,
    },
    collectionEmptyText: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.4)",
    },
    // Candidate selection modal
    candidateModal: {
      flex: 1,
      backgroundColor: "#0F0D0B",
      paddingTop: 24,
    },
    candidateHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    candidateTitle: {
      fontSize: 18,
      fontFamily: "DMSans_700Bold",
      color: "#fff",
    },
    candidateClose: {
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: "#E8825C",
    },
    candidateSubtitle: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.55)",
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    candidateList: {
      paddingHorizontal: 20,
    },
    candidateRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(255,255,255,0.08)",
    },
    candidateArtwork: {
      width: 48,
      height: 48,
      borderRadius: 8,
    },
    candidateInfo: {
      flex: 1,
      marginLeft: 12,
    },
    candidateSongTitle: {
      fontSize: 16,
      fontFamily: "DMSans_600SemiBold",
      color: "#fff",
    },
    candidateArtist: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.55)",
      marginTop: 2,
    },
    // Tag Friends
  });
}
