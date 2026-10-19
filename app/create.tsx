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
  FlatList,
  Keyboard,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { PhotoPickerSection, type PhotoPickerHandle } from "@/components/PhotoPickerSection";
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
import { MOODS } from "@/constants/Moods";
import { startTimer } from "@/lib/perf";
import { setWritingSession } from "@/lib/writingSession";
import { loadCaptureDraft, saveCaptureDraft, clearCaptureDraft } from "@/lib/captureDraft";

// Starters, not prompts: they open a sentence for the three ways people use
// the journal (a memory, a discovery, a day) and get out of the way.
const STARTERS = [
  { label: "It takes me back to…", text: "It takes me back to " },
  { label: "Just found this…", text: "Just found this " },
  { label: "Today I…", text: "Today I " },
] as const;

type DetailSheet = "mood" | "people" | "place" | "date" | null;

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatDateChip(date: Date | null) {
  if (!date) return "No date";
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function withMore(first: string, count: number) {
  return count > 1 ? `${first} +${count - 1}` : first;
}

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  // Open → saved, the number that says whether capture is quick.
  const [sinceOpen] = useState(() => startTimer());
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const photoPickerRef = useRef<PhotoPickerHandle>(null);
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
    /** "1" from the widget's Identify tile and control: start listening. */
    identify?: string;
    /** Where capture was opened from ("widget"), for analytics. */
    source?: string;
  }>();

  // Opened from a widget or control: worth knowing whether capture-from-
  // anywhere gets used at all.
  useEffect(() => {
    if (params.source) posthog.capture("capture_opened", { source: params.source, identify: params.identify === "1" });
    // Once per screen open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      extractExifFromPath(paths[0]).then((meta) => {
        if (meta.date || meta.location) setMetaSuggestion(meta);
      });
    } catch {}
  }, [params.sharedPhotoPaths]);

  const hasSong = !!song;

  // The writing area is uncontrolled. `reflection` mirrors what's typed; text
  // set from code (starters, prompts) remounts the input with it as the
  // default instead of pushing it through `value`. A controlled value plus
  // focus() in one tick dispatches two native commands, and RN 0.81 crashed
  // (SIGSEGV in Scheduler::uiManagerDidDispatchCommand) on exactly that.
  const [reflection, setReflection] = useState("");
  const [reflectionSeed, setReflectionSeed] = useState({ key: 0, text: "", focus: false });
  const replaceReflection = useCallback((text: string, focus: boolean) => {
    setReflection(text);
    setReflectionSeed((seed) => ({ key: seed.key + 1, text, focus }));
  }, []);

  // Pre-fill reflection from a journal prompt
  useEffect(() => {
    if (params.promptStarter) replaceReflection(params.promptStarter, false);
  }, [params.promptStarter, replaceReflection]);

  // Drafts: writing survives Cancel, a crash or iOS killing the app. Restore
  // only into a blank capture (not a share, prompt or widget Identify), and
  // don't save until the restore attempt is done, or an empty first save
  // would wipe the draft before it's read.
  const [restoredDraft, setRestoredDraft] = useState(false);
  const draftReady = useRef(false);
  const latestDraft = useRef<{ reflection: string; song: Song | null }>({ reflection: "", song: null });
  useEffect(() => {
    if (!user) return;
    const prefilled =
      !!params.songTitle || !!params.promptStarter || !!params.shareCandidates ||
      !!params.shareFailedUrl || !!params.sharedPhotoPaths || params.identify === "1";
    if (prefilled) {
      draftReady.current = true;
      return;
    }
    loadCaptureDraft(user.id).then((draft) => {
      if (draft) {
        replaceReflection(draft.reflection, false);
        if (draft.song) handleSongChange(draft.song);
        setRestoredDraft(true);
      }
      draftReady.current = true;
    });
    // Once per screen open, for the signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    latestDraft.current = { reflection, song };
    if (!user || !draftReady.current) return;
    const t = setTimeout(() => saveCaptureDraft(user.id, { reflection, song }), 600);
    return () => clearTimeout(t);
  }, [reflection, song, user]);

  // Leaving (Cancel, swipe, save) flushes the last few keystrokes the
  // debounce hasn't written yet. After a save the form is already blank, so
  // this clears the draft instead.
  useEffect(
    () => () => {
      if (user && draftReady.current) void saveCaptureDraft(user.id, latestDraft.current);
    },
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const startFresh = () => {
    Haptics.selectionAsync();
    if (user) void clearCaptureDraft(user.id);
    replaceReflection("", false);
    handleSongChange(null);
    setRestoredDraft(false);
  };

  const openFullPage = () => {
    Keyboard.dismiss();
    setWritingSession({
      text: latestDraft.current.reflection,
      songTitle: song?.title,
      songArtist: song?.artistName,
      songArtworkUrl: song?.artworkUrl || undefined,
      placeholder: "What's this song doing for you?",
      onDone: (text) => replaceReflection(text, false),
    });
    router.push("/write");
  };

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [weatherResult, setWeatherResult] = useState<WeatherResult | null>(null);
  const [metaSuggestion, setMetaSuggestion] = useState<{ date?: Date; location?: string; lat?: number; lng?: number } | null>(null);
  const [detailSheet, setDetailSheet] = useState<DetailSheet>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumPickerVisible, setAlbumPickerVisible] = useState(false);
  const [createAlbumVisible, setCreateAlbumVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promptPickerVisible, setPromptPickerVisible] = useState(false);

  const loadAlbums = useCallback(() => {
    if (user && albums.length === 0) fetchAlbums(user.id).then(setAlbums).catch(() => {});
  }, [user, albums.length]);

  // Opened from an album view: pre-select that album.
  useEffect(() => {
    if (params.collectionId) loadAlbums();
  }, [params.collectionId, loadAlbums]);

  // The detail bar rides the keyboard; it only needs the home-indicator
  // inset when the keyboard is down.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
      const sinceSave = startTimer();
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
        capture_ms: sinceOpen(),
        save_ms: sinceSave(),
        source: params.source ?? null,
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

      // Reset form (the unmount flush then clears the draft; clear now too in
      // case the screen stays mounted)
      if (user) void clearCaptureDraft(user.id);
      setRestoredDraft(false);
      handleSongChange(null);
      replaceReflection("", false);
      setSelectedMoods([]);
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setLocationResult(null);
      setSelectedAlbum(null);
      setWeatherResult(null);
      setMetaSuggestion(null);
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

  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  const openSheet = (sheet: Exclude<DetailSheet, null>) => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setDetailSheet(sheet);
  };

  const applyStarter = (text: string) => {
    Haptics.selectionAsync();
    replaceReflection(text, true);
  };

  const moodLabel = (value: string) =>
    [...MOODS, ...(profile?.customMoods ?? [])].find((m) => m.value === value)?.label ?? value;

  // Each chip names its value once set, so the bar doubles as a summary of
  // what's attached. A default date of today isn't a choice, so it stays plain.
  const chips: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; set: boolean; onPress: () => void }[] = [
    {
      key: "photo",
      icon: "image-outline",
      label: photos.length ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}` : "Photo",
      set: photos.length > 0,
      onPress: () => {
        Keyboard.dismiss();
        photoPickerRef.current?.openPicker();
      },
    },
    {
      key: "mood",
      icon: "happy-outline",
      label: selectedMoods.length ? withMore(moodLabel(selectedMoods[0]), selectedMoods.length) : "Mood",
      set: selectedMoods.length > 0,
      onPress: () => openSheet("mood"),
    },
    {
      key: "people",
      icon: "people-outline",
      label: people.length ? withMore(`With ${people[0]}`, people.length) : "People",
      set: people.length > 0,
      onPress: () => openSheet("people"),
    },
    {
      key: "place",
      icon: "location-outline",
      label: locationResult?.name ?? "Place",
      set: !!locationResult,
      onPress: () => openSheet("place"),
    },
    {
      key: "date",
      icon: "calendar-outline",
      label: formatDateChip(momentDate),
      set: !!momentDate && !isSameDay(momentDate, new Date()),
      onPress: () => openSheet("date"),
    },
    {
      key: "album",
      icon: "albums-outline",
      label: selectedAlbum?.name ?? "Album",
      set: !!selectedAlbum,
      onPress: () => {
        Keyboard.dismiss();
        loadAlbums();
        setAlbumPickerVisible(true);
      },
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={close} hitSlop={8} style={styles.cancelButton} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="create-save"
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <SongPickerSection
          song={song}
          onChange={handleSongChange}
          photos={photos}
          suggestNowPlaying={!params.shareCandidates && !params.shareFailedUrl && params.identify !== "1"}
          autoIdentify={params.identify === "1"}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <TouchableOpacity
            testID="create-full-page"
            style={styles.fullPageButton}
            onPress={openFullPage}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Write on a full page"
          >
            <Ionicons name="expand-outline" size={15} color={theme.colors.textSecondary} />
            <Text style={styles.fullPageText}>Full page</Text>
          </TouchableOpacity>
        </View>

        {restoredDraft ? (
          <View style={styles.draftRow}>
            <Text style={styles.draftText}>Picked up where you left off</Text>
            <TouchableOpacity onPress={startFresh} hitSlop={8} accessibilityRole="button">
              <Text style={styles.draftAction}>Start fresh</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TextInput
          key={reflectionSeed.key}
          testID="create-reflection"
          style={styles.reflectionInput}
          placeholder="What's this song doing for you?"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          selectionColor={theme.colors.accent}
          accessibilityLabel="Write about this song"
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
          defaultValue={reflectionSeed.text}
          autoFocus={reflectionSeed.focus}
          onChangeText={setReflection}
        />

        {reflection.trim().length === 0 && (
          <View style={styles.starters}>
            {STARTERS.map((starter) => (
              <TouchableOpacity
                key={starter.label}
                style={styles.starterChip}
                activeOpacity={0.7}
                onPress={() => applyStarter(starter.text)}
              >
                <Text style={styles.starterText}>{starter.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.starterChip}
              activeOpacity={0.7}
              onPress={() => {
                Keyboard.dismiss();
                setPromptPickerVisible(true);
              }}
            >
              <Text style={styles.starterText}>More prompts</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.photos}>
          <PhotoPickerSection
            ref={photoPickerRef}
            compact
            photos={photos}
            onChange={setPhotos}
            onApplyMeta={handleApplyMeta}
            suggestion={metaSuggestion}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.detailBar, { paddingBottom: keyboardVisible ? theme.spacing.md : Math.max(insets.bottom, theme.spacing.md) }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.detailBarContent}
        >
          {chips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              testID={`create-detail-${chip.key}`}
              style={styles.detailChip}
              activeOpacity={0.7}
              onPress={chip.onPress}
              accessibilityRole="button"
            >
              <Ionicons
                name={chip.icon}
                size={17}
                color={chip.set ? theme.colors.accent : theme.colors.text}
              />
              <Text style={[styles.detailChipText, chip.set && styles.detailChipTextSet]} numberOfLines={1}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <BottomSheet visible={detailSheet === "mood"} onClose={() => setDetailSheet(null)} title="Mood" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <MoodSelector
            selectedMoods={selectedMoods}
            onChangeMoods={setSelectedMoods}
            customMoods={profile?.customMoods ?? []}
            saveCustomMood={saveCustomMood}
            deleteCustomMood={deleteCustomMood}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={detailSheet === "people"} onClose={() => setDetailSheet(null)} title="Who was there" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <PeopleInput people={people} onChangePeople={setPeople} />
        </View>
      </BottomSheet>

      <BottomSheet visible={detailSheet === "place"} onClose={() => setDetailSheet(null)} title="Place" keyboardAvoiding>
        <View style={styles.sheetBody}>
          <LocationField value={locationResult} onChange={setLocationResult} detectCurrentLocation={!locationResult} />
          {weatherResult ? (
            <Text style={styles.weatherText}>
              {weatherResult.condition} · {weatherResult.tempF}°F
            </Text>
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={detailSheet === "date"} onClose={() => setDetailSheet(null)} title="Date">
        <View style={styles.sheetBody}>
          {momentDate ? (
            <DateTimePicker
              value={momentDate}
              mode="date"
              display="inline"
              maximumDate={new Date()}
              onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) setMomentDate(date); }}
              themeVariant={theme.isDark ? "dark" : "light"}
              accentColor={theme.colors.accent}
            />
          ) : (
            <Text style={styles.noDateText}>This entry has no specific date.</Text>
          )}
          <TouchableOpacity
            style={styles.dateToggle}
            onPress={() => setMomentDate(momentDate ? null : new Date())}
            hitSlop={8}
          >
            <Text style={styles.dateToggleText}>{momentDate ? "No specific date" : "Set a date"}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

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
        onSelect={(prompt) => replaceReflection(prompt, true)}
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
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: theme.spacing.sm,
      paddingRight: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    cancelButton: {
      height: 44,
      paddingHorizontal: theme.spacing.md,
      justifyContent: "center",
    },
    cancelText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    saveButton: {
      height: 36,
      minWidth: 72,
      paddingHorizontal: 18,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: theme.colors.buttonText,
      fontSize: 15,
      fontFamily: theme.fonts.bodySemibold,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 14,
      paddingBottom: theme.spacing["3xl"],
    },
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginTop: 22,
      marginBottom: 18,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
    fullPageButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    fullPageText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    draftRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    draftText: {
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    draftAction: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    // Borderless, in the reading face: this is a page, not a form field.
    reflectionInput: {
      minHeight: 200,
      padding: 0,
      fontSize: theme.fontSize.xl,
      lineHeight: 33,
      fontFamily: theme.fonts.reading,
      color: theme.colors.text,
    },
    starters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    starterChip: {
      height: 32,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: "center",
    },
    starterText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    photos: {
      marginTop: theme.spacing.xl,
    },
    error: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      marginTop: theme.spacing.lg,
    },
    detailBar: {
      paddingTop: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
      backgroundColor: theme.colors.background,
    },
    detailBarContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    detailChip: {
      height: 40,
      maxWidth: 200,
      paddingHorizontal: 13,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    detailChipText: {
      flexShrink: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    detailChipTextSet: {
      fontFamily: theme.fonts.bodySemibold,
    },
    sheetBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
    },
    weatherText: {
      marginTop: theme.spacing.md,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    noDateText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      paddingVertical: theme.spacing.lg,
    },
    dateToggle: {
      alignSelf: "flex-start",
      paddingVertical: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    dateToggleText: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.accent,
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
  });
}
