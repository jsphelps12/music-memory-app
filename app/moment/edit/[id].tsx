import { useState, useEffect, useCallback, useMemo, useRef, type SetStateAction } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams, usePreventRemove } from "expo-router";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { setWritingSession } from "@/lib/writingSession";
import { supabase } from "@/lib/supabase";
import type { MusicProviderType } from "@/types";
import { getPublicPhotoUrl } from "@/lib/storage";
import { updateMoment } from "@/lib/saveMoment";
import { pairStoredPhotos, type EditedPhoto } from "@/lib/photoOrder";
import type { MediaRef } from "@/lib/linkedMedia";
import { mapRowToMoment } from "@/lib/moments";
import { LocationField } from "@/components/LocationField";
import type { GeoResult } from "@/lib/geocoding";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import { SectionLabel } from "@/components/SectionLabel";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song } from "@/types";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { friendlyError } from "@/lib/errors";
import { onSongSelected } from "@/lib/songEvents";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { invalidateMomentCaches } from "@/lib/cacheInvalidation";

type ScreenState = "loading" | "not_found" | "error" | "ready";

/** Local calendar day, so a date the picker didn't move compares equal. */
function dayKey(d: Date | null): string {
  return d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : "";
}

/** Everything the screen can change, as one comparable string. */
function editSnapshot(v: {
  song: Song | null;
  reflection: string;
  moods: string[];
  people: string[];
  photos: EditedPhoto[];
  momentDate: Date | null;
  location: GeoResult | null;
}): string {
  return JSON.stringify([
    v.song ? [v.song.id, v.song.title, v.song.artistName, v.song.appleMusicId, v.song.spotifyId] : null,
    v.reflection,
    v.moods,
    v.people,
    v.photos.map((p) => (p.kind === "kept" ? p.path : p.uri)),
    dayKey(v.momentDate),
    v.location ? [v.location.name, v.location.lat, v.location.lng] : null,
  ]);
}

export default function EditMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const params = useLocalSearchParams<{
    id: string;
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songProvider?: string;
    songAppleMusicId?: string;
    songSpotifyId?: string;
    songDurationMs?: string;
  }>();

  const [song, setSong] = useState<Song | null>(null);
  // The song as stored, so a save only replaces the preview URL when the
  // song actually changed.
  const originalSongRef = useRef<Song | null>(null);
  const [reflection, setReflection] = useState("");
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  // Every photo in the strip, stored and new, in the order the user arranged.
  const [photos, setPhotos] = useState<EditedPhoto[]>([]);
  // What was on the row when we loaded it: the stored photos (paired with
  // their thumbnails) the strip can show, and the raw arrays, so photos the
  // user removed can be deleted from storage after a successful save.
  const [storedPhotos, setStoredPhotos] = useState<{ path: string; thumb: string | null; ref?: MediaRef | null }[]>([]);
  const originalPhotosRef = useRef<{ photos: string[]; thumbnails: string[] }>({
    photos: [],
    thumbnails: [],
  });
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  // The moment as loaded, to tell whether leaving would lose edits.
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  // Set after a successful save so the unsaved-changes guard lets us leave.
  const [saved, setSaved] = useState(false);
  // Set when the person chooses Discard, so the guard lifts before the
  // blocked navigation repeats.
  const [discarding, setDiscarding] = useState(false);

  // Listen for song selected in song-search
  useEffect(() => onSongSelected((s) => setSong(s)), []);

  const fetchMoment = useCallback(async () => {
    setScreenState("loading");
    setLoadError("");
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchError) {
      setLoadError(friendlyError(fetchError));
      setScreenState("error");
      return;
    }
    // Deleted (or never yours): nothing to retry.
    if (!data) {
      setScreenState("not_found");
      return;
    }

    const moment = mapRowToMoment(data);
    const storedSong: Song = {
      id: moment.songSpotifyId ?? moment.songAppleMusicId ?? "",
      title: moment.songTitle,
      artistName: moment.songArtist,
      albumName: moment.songAlbumName ?? "",
      artworkUrl: moment.songArtworkUrl ?? "",
      provider: moment.songProvider,
      appleMusicId: moment.songAppleMusicId,
      spotifyId: moment.songSpotifyId,
      durationMs: 0,
    };
    originalSongRef.current = storedSong;
    setSong(storedSong);
    setReflection(moment.reflectionText ?? "");
    setSelectedMoods(moment.moods);
    setPeople(moment.people);
    // Keep each photo's link to Photos (1.4) with it through any reordering.
    const stored = pairStoredPhotos(moment.photoUrls, moment.photoThumbnails).map((p, i) => ({
      ...p,
      ref: moment.mediaRefs?.[i] ?? null,
    }));
    setStoredPhotos(stored);
    const loadedPhotos: EditedPhoto[] = stored.map((p) => ({ kind: "kept", ...p }));
    setPhotos(loadedPhotos);
    originalPhotosRef.current = {
      photos: moment.photoUrls,
      thumbnails: moment.photoThumbnails,
    };
    const loadedDate = moment.momentDate ? new Date(moment.momentDate + "T00:00:00") : null;
    const loadedLocation: GeoResult | null = moment.location
      ? { name: moment.location, lat: moment.locationLat, lng: moment.locationLng }
      : null;
    setMomentDate(loadedDate);
    setLocationResult(loadedLocation);
    setInitialSnapshot(
      editSnapshot({
        song: storedSong,
        reflection: moment.reflectionText ?? "",
        moods: moment.moods,
        people: moment.people,
        photos: loadedPhotos,
        momentDate: loadedDate,
        location: loadedLocation,
      })
    );
    setScreenState("ready");
  }, [params.id]);

  useEffect(() => {
    fetchMoment();
  }, [fetchMoment]);

  useEffect(() => {
    if (params.songTitle) {
      const provider = (params.songProvider as MusicProviderType | undefined) ?? 'apple_music';
      setSong({
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
    // Depend on every field read above — songId alone lets two songs that both
    // lack an id collide on "", silently dropping the second selection.
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
  ]);

  // PhotoPickerSection takes one ordered list of strings. Stored photos go in
  // as their public URLs, photos picked this session as local file URIs; the
  // map turns a URL back into its stored path and thumbnail on the way out.
  // Whatever order the user drags them into is the order updateMoment saves.
  const storedByUrl = useMemo(
    () => new Map(storedPhotos.map((p) => [getPublicPhotoUrl(p.path), p])),
    [storedPhotos]
  );

  const pickerPhotos = useMemo(
    () => photos.map((p) => (p.kind === "kept" ? getPublicPhotoUrl(p.path) : p.uri)),
    [photos]
  );

  // Library ids of photos picked this session (they link instead of
  // uploading) and poster URI → length for videos (linked, never uploaded).
  // Refs, not state: the picker reports them in the same tick as onChange.
  const pickedAssets = useRef<Record<string, string>>({});
  const pickedVideos = useRef<Record<string, number>>({});

  const toEditedPhoto = (uri: string): EditedPhoto => {
    const stored = storedByUrl.get(uri);
    return stored
      ? { kind: "kept", ...stored }
      : {
          kind: "new",
          uri,
          assetId: pickedAssets.current[uri] ?? null,
          durationMs: pickedVideos.current[uri] ?? null,
        };
  };

  // The picker can hand over an updater (photos picked from the library are
  // added to the strip as it is when picking ends).
  const handlePhotosChange = (next: SetStateAction<string[]>) => {
    if (typeof next !== "function") {
      setPhotos(next.map(toEditedPhoto));
      return;
    }
    setPhotos((current) =>
      next(current.map((p) => (p.kind === "kept" ? getPublicPhotoUrl(p.path) : p.uri))).map(toEditedPhoto)
    );
  };

  const hasSong = !!song;

  const openSongSearch = () =>
    router.push({
      pathname: "/song-search",
      params: { returnTo: "edit", momentId: params.id },
    });

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setMomentDate(date);
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasSong) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please select a song.");
      return;
    }
    setError("");
    setSaving(true);
    if (!user) {
      setError("Session expired. Please sign in again.");
      setSaving(false);
      return;
    }
    try {
      await updateMoment({
        momentId: params.id,
        userId: user.id,
        song: song!,
        originalSong: originalSongRef.current ?? song!,
        reflection,
        moods: selectedMoods,
        people,
        locationResult,
        momentDate,
        originalPhotos: originalPhotosRef.current.photos,
        originalThumbnails: originalPhotosRef.current.thumbnails,
        photos,
      });

      posthog.capture("moment_edited", {
        has_reflection: reflection.trim().length > 0,
        has_mood: selectedMoods.length > 0,
        mood_count: selectedMoods.length,
        has_people: people.length > 0,
        photo_count: photos.length,
        has_location: Boolean(locationResult),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markTimelineStale();
      invalidateMomentCaches(queryClient, user?.id);
      // Leaves in the effect below, once the guard has lifted.
      setSaved(true);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setSaving(false);
    }
  };

  // ── Unsaved changes ─────────────────────────────────────────────────────
  // Like Edit profile: leaving with edits (✕ or swipe) asks first; nothing
  // changed, or just saved, leaves straight away.
  const dirty =
    screenState === "ready" &&
    initialSnapshot !== null &&
    editSnapshot({
      song,
      reflection,
      moods: selectedMoods,
      people,
      photos,
      momentDate,
      location: locationResult,
    }) !== initialSnapshot;

  usePreventRemove(dirty && !saved && !discarding, ({ repeat }) => {
    void confirmSheet({
      title: "Discard changes?",
      message: "Your edits to this moment won't be saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    }).then((discard) => {
      if (!discard) return;
      setDiscarding(true);
      repeat();
    });
  });

  // Leave only after the render that lifted the guard.
  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

  if (screenState === "loading") {
    // A fullScreenModal can't be swiped away: the ✕ is there while it loads.
    return (
      <View style={styles.container}>
        <ScreenHeader leading="close" title="Edit moment" />
        <SkeletonMomentDetail />
      </View>
    );
  }

  if (screenState === "not_found") {
    return <ErrorState message="Moment not found" onBack={() => router.back()} />;
  }

  if (screenState === "error") {
    return (
      <ErrorState
        message={loadError}
        onRetry={fetchMoment}
        onBack={() => router.back()}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <ScreenHeader
        leading="close"
        title="Edit moment"
        right={<Button label="Save" size="pill" onPress={handleSave} loading={saving} />}
      />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Song */}
        {hasSong ? (
          <TouchableOpacity
            style={styles.songRow}
            activeOpacity={0.7}
            onPress={openSongSearch}
            accessibilityRole="button"
            accessibilityLabel={`${song!.title} by ${song!.artistName}. Change song`}
          >
            {song!.artworkUrl ? (
              <AppImage
                source={{ uri: song!.artworkUrl }}
                style={styles.artwork}
              />
            ) : (
              <ArtworkPlaceholder style={styles.artwork} />
            )}
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {song!.title}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {song!.artistName}
              </Text>
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        ) : (
          <Button label="Select song" icon="musical-notes-outline" onPress={openSongSearch} />
        )}

        {/* Reflection */}
        <SectionLabel
          style={styles.section}
          right={
            <Button
              label="Full page"
              variant="text"
              tone="secondary"
              size="pill"
              style={styles.labelAction}
              accessibilityLabel="Write on a full page"
              onPress={() => {
                setWritingSession({
                  text: reflection,
                  songTitle: song?.title,
                  songArtist: song?.artistName,
                  songArtworkUrl: song?.artworkUrl || undefined,
                  onDone: setReflection,
                });
                router.push("/write");
              }}
            />
          }
        >
          Reflection
        </SectionLabel>
        <TextField
          multiline
          variant="reading"
          placeholder="What does this song remind you of? (optional)"
          autoCapitalize="sentences"
          autoCorrect
          value={reflection}
          onChangeText={setReflection}
        />

        {/* Mood selector */}
        <SectionLabel style={styles.section}>Mood</SectionLabel>
        <MoodSelector
          selectedMoods={selectedMoods}
          onChangeMoods={setSelectedMoods}
          customMoods={profile?.customMoods ?? []}
          saveCustomMood={saveCustomMood}
          deleteCustomMood={deleteCustomMood}
        />

        {/* People */}
        <SectionLabel style={styles.section}>People</SectionLabel>
        <PeopleInput people={people} onChangePeople={setPeople} />

        {/* Photos: the same picker as capture, so edit gets its tap-to-view
            and reordering too. */}
        <SectionLabel style={styles.section}>Photos</SectionLabel>
        <PhotoPickerSection
          photos={pickerPhotos}
          onChange={handlePhotosChange}
          onAssetIds={(map) => Object.assign(pickedAssets.current, map)}
          onVideos={(map) => Object.assign(pickedVideos.current, map)}
          horizontalPadding={theme.spacing.xl}
        />

        {/* Date picker */}
        <SectionLabel
          style={styles.section}
          right={
            momentDate ? (
              <Button
                label="Clear"
                variant="text"
                tone="secondary"
                size="pill"
                style={styles.labelAction}
                onPress={() => setMomentDate(null)}
              />
            ) : (
              <Button
                label="Set date"
                variant="text"
                size="pill"
                style={styles.labelAction}
                onPress={() => setMomentDate(new Date())}
              />
            )
          }
        >
          Date
        </SectionLabel>
        {momentDate ? (
          <DateTimePicker
            value={momentDate}
            mode="date"
            display="compact"
            maximumDate={new Date()}
            onChange={handleDateChange}
            themeVariant={theme.isDark ? "dark" : "light"}
            accentColor={theme.colors.text}
            style={styles.datePicker}
          />
        ) : (
          <Text style={styles.noDateText}>No specific date</Text>
        )}

        {/* Location */}
        <SectionLabel style={styles.section}>Location</SectionLabel>
        <LocationField value={locationResult} onChange={setLocationResult} />

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* A fullScreenModal: the root confirm host can't present over it
          (CLAUDE.md, Confirms on modal screens). */}
      <ConfirmSheetHost />
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
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing["4xl"],
    },
    // A quiet panel (chip paper, 12 radius, no border), the whole row taps.
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.chipBg,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
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
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    songArtist: {
      fontFamily: theme.fonts.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    changeText: {
      ...theme.typography.callout,
      color: theme.colors.textSecondary,
      marginLeft: theme.spacing.sm,
    },
    section: {
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    // A text action inside a section label: no taller than the label row.
    labelAction: {
      minHeight: 28,
      paddingHorizontal: 0,
    },
    noDateText: {
      ...theme.typography.body,
      color: theme.colors.textTertiary,
      paddingVertical: theme.spacing.sm,
    },
    datePicker: {
      alignSelf: "flex-start",
    },
    error: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.lg,
    },
  });
}
