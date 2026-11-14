import { useState, useEffect, useCallback, useMemo, useRef, } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
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
import { mapRowToMoment } from "@/lib/moments";
import { LocationField } from "@/components/LocationField";
import type { GeoResult } from "@/lib/geocoding";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { ScreenHeader } from "@/components/ScreenHeader";
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

export default function EditMomentScreen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollViewRef = useRef<ScrollView>(null);
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
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [existingThumbnails, setExistingThumbnails] = useState<string[]>([]);
  // Snapshot of what was on the row when we loaded it, so photos the user
  // removed can be deleted from storage after a successful save.
  const originalPhotosRef = useRef<{ photos: string[]; thumbnails: string[] }>({
    photos: [],
    thumbnails: [],
  });
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [loadingMoment, setLoadingMoment] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  // Listen for song selected in song-search
  useEffect(() => onSongSelected((s) => setSong(s)), []);

  const fetchMoment = useCallback(async () => {
    setLoadingMoment(true);
    setLoadError("");
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError || !data) {
      setLoadError(friendlyError(fetchError ?? new Error("Moment not found")));
      setLoadingMoment(false);
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
    setExistingPhotos(moment.photoUrls);
    setExistingThumbnails(moment.photoThumbnails);
    originalPhotosRef.current = {
      photos: moment.photoUrls,
      thumbnails: moment.photoThumbnails,
    };
    setMomentDate(moment.momentDate ? new Date(moment.momentDate + "T00:00:00") : null);
    setLocationResult(
      moment.location
        ? { name: moment.location, lat: moment.locationLat, lng: moment.locationLng }
        : null
    );
    setLoadingMoment(false);
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
  const storedByUrl = useMemo(() => {
    const map = new Map<string, { path: string; thumb?: string }>();
    existingPhotos.forEach((path, i) => {
      map.set(getPublicPhotoUrl(path), { path, thumb: existingThumbnails[i] });
    });
    return map;
  }, [existingPhotos, existingThumbnails]);

  // Stored photos first: updateMoment saves kept photos ahead of new uploads,
  // so that's the order the strip shows. Reordering within each group sticks.
  const pickerPhotos = useMemo(
    () => [...storedByUrl.keys(), ...newPhotos],
    [storedByUrl, newPhotos]
  );

  const handlePhotosChange = (next: string[]) => {
    const kept = next.filter((uri) => storedByUrl.has(uri)).map((uri) => storedByUrl.get(uri)!);
    setExistingPhotos(kept.map((k) => k.path));
    // Moments from before thumbnails have none; keep that list empty then.
    setExistingThumbnails(kept.map((k) => k.thumb).filter((t): t is string => !!t));
    setNewPhotos(next.filter((uri) => !storedByUrl.has(uri)));
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
    setLoading(true);
    if (!user) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
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
        keptPhotos: existingPhotos,
        keptThumbnails: existingThumbnails,
        newPhotos,
      });

      posthog.capture("moment_edited", {
        has_reflection: reflection.trim().length > 0,
        has_mood: selectedMoods.length > 0,
        mood_count: selectedMoods.length,
        has_people: people.length > 0,
        photo_count: existingPhotos.length + newPhotos.length,
        has_location: Boolean(locationResult),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markTimelineStale();
      invalidateMomentCaches(queryClient, user?.id);
      router.back();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setLoading(false);
    }
  };

  if (loadingMoment) {
    return (
      <View style={styles.container}>
        <SkeletonMomentDetail />
      </View>
    );
  }

  if (loadError) {
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
        title="Edit moment"
        right={<Button label="Save" size="pill" onPress={handleSave} loading={loading} />}
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
