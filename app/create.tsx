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
  FlatList,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { extractExifFromPath } from "@/lib/photoMetadata";
import { saveMoment } from "@/lib/saveMoment";
import { maybeRequestReview } from "@/lib/reviewPrompt";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
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
import { invalidateMomentCaches, invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { getProvider } from "@/lib/providers";
import type { MusicProviderType } from "@/types";
import { PromptPickerModal } from "@/components/PromptPickerModal";
import { BottomSheet } from "@/components/BottomSheet";
import { fetchWeather, WeatherResult } from "@/lib/weather";
import { dateToStr } from "@/lib/dateUtils";

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songProvider?: string;
    songAppleMusicId?: string;
    songSpotifyId?: string;
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
    previewFetchRef.current = s
      ? getProvider(s.provider).fetchPreviewUrl(s).then((url) => ({ previewUrl: url, albumName: null }))
      : null;
  }, []);
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);

  // Sync song from params when returning from song-search with a share intent song
  useEffect(() => {
    if (params.songTitle) {
      const provider = (params.songProvider as MusicProviderType | undefined) ?? 'apple_music';
      handleSongChange({
        id: params.songId ?? "",
        title: params.songTitle,
        artistName: params.songArtist ?? "",
        albumName: params.songAlbum ?? "",
        artworkUrl: params.songArtwork ?? "",
        provider,
        appleMusicId: params.songAppleMusicId || null,
        spotifyId: params.songSpotifyId || null,
        durationMs: Number(params.songDurationMs) || 0,
      });
    }
    // Depend on every field read above, not just songId: share-intent songs
    // often arrive without an id, so consecutive selections would collide on
    // "" and the second one would be silently dropped — saving the wrong song.
  }, [
    params.songId,
    params.songTitle,
    params.songArtist,
    params.songAlbum,
    params.songArtwork,
    params.songProvider,
    params.songAppleMusicId,
    params.songSpotifyId,
    params.songDurationMs,
    handleSongChange,
  ]);

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

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
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
        moods: selectedMoods,
        locationResult,
        momentDate,
        selectedAlbum,
        prefetchedPreview,
        weatherResult,
      });

      // Captured before the form reset below clears selectedAlbum.
      const savedToAlbumId = selectedAlbum?.id;

      posthog.capture("moment_created", {
        song_title: song!.title,
        song_artist: song!.artistName,
        has_reflection: reflection.trim().length > 0,
        has_mood: selectedMoods.length > 0,
        mood_count: selectedMoods.length,
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
      setSelectedMoods([]);
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setLocationResult(null);
      setSelectedAlbum(null);
      setWeatherResult(null);
      setMetaSuggestion(null);
      setDismissedMetaSuggestion(false);
      setShowDetails(false);
      setError("");

      markTimelineStale(savedMoment);
      invalidateMomentCaches(queryClient, user.id);
      // saveMoment adds the moment to the album for us, so the album caches are
      // stale too — invalidate here rather than widening saveMoment's signature.
      if (savedToAlbumId) invalidateAlbumCaches(queryClient, user.id, savedToAlbumId);

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
            <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <SongPickerSection song={song} onChange={handleSongChange} photos={photos} />

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          testID="create-reflection"
          style={[styles.reflectionInput, focusedField === "reflection" && { borderColor: theme.colors.accent }]}
          placeholder="What does this song remind you of? (optional)"
          placeholderTextColor={theme.colors.placeholder}
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
            />

            {/* Mood selector */}
            <Text style={styles.sectionLabel}>Mood</Text>
            <MoodSelector
              selectedMoods={selectedMoods}
              onChangeMoods={setSelectedMoods}
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
                      selectedAlbum.isPublic && styles.collectionChipPublic,
                    ]}
                    onPress={() => setAlbumPickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={selectedAlbum.isPublic ? "people-outline" : "folder-outline"}
                      size={14}
                      color={selectedAlbum.isPublic ? theme.colors.accentSecondary : theme.colors.textSecondary}
                    />
                    <Text style={[
                      styles.collectionChipText,
                      selectedAlbum.isPublic && styles.collectionChipTextPublic,
                    ]}>
                      {selectedAlbum.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelectedAlbum(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
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
                <Ionicons name="folder-outline" size={16} color={theme.colors.textTertiary} />
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
          testID="create-save"
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
        <CreateAlbumSheet
          visible={createAlbumVisible}
          userId={user.id}
          defaultShared={false}
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

      {/* Spotify candidate selection — quick pick, so a compact sheet */}
      <BottomSheet
        visible={showCandidateModal}
        onClose={() => setShowCandidateModal(false)}
        title="Select the right match"
        maxHeight="75%"
      >
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
                  <AppImage source={{ uri: item.artworkUrl }} style={styles.candidateArtwork} />
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
      </BottomSheet>
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
      color: theme.colors.text,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.textTertiary,
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
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    promptButton: {
      marginTop: 8,
      alignSelf: "flex-start",
      paddingVertical: 4,
    },
    promptButtonText: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
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
      color: theme.colors.accent,
    },
    dateClearText: {
      fontSize: 14,
      color: theme.colors.destructive,
    },
    dateSetText: {
      fontSize: 14,
      color: theme.colors.accent,
    },
    noDateText: {
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
      paddingVertical: 8,
    },
    datePicker: {
      alignSelf: "center",
    },
    error: {
      color: theme.colors.destructive,
      fontSize: 14,
      marginTop: 16,
    },
    saveButton: {
      height: 52,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: theme.colors.buttonText,
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
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    collectionChipPublic: {
      backgroundColor: theme.colors.accentSecondaryBg,
      borderColor: theme.colors.accentSecondary,
    },
    collectionChipText: {
      fontSize: 14,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.text,
    },
    collectionChipTextPublic: {
      color: theme.colors.accentSecondary,
    },
    collectionHint: {
      fontSize: 12,
      color: theme.colors.textTertiary,
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
      color: theme.colors.textTertiary,
    },
    // Candidate selection sheet
    candidateSubtitle: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
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
      borderBottomColor: theme.colors.border,
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
      color: theme.colors.text,
    },
    candidateArtist: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    // Tag Friends
  });
}
