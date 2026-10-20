import { useState, useEffect, useCallback, useMemo, useRef, } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  ActionSheetIOS,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
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
  const [focusedField, setFocusedField] = useState("");

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

  const existingPhotoUrls = useMemo(
    () => existingPhotos.map(getPublicPhotoUrl),
    [existingPhotos]
  );

  const hasSong = !!song;

  const handleAddPhotos = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Library"],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;

        if (buttonIndex === 1) {
          const { status } =
            await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Camera Access Required",
              "To take a photo, allow camera access in Settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ]
            );
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            exif: true,
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            quality: 0.8,
            exif: true,
          });
        }

        if (result && !result.canceled) {
          const uris = result.assets.map((a) => a.uri);
          setNewPhotos((prev) => [...prev, ...uris]);
        }
      }
    );
  };

  const handleRemoveExistingPhoto = (index: number) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
    setExistingThumbnails((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewPhoto = (uri: string) => {
    setNewPhotos((prev) => prev.filter((p) => p !== uri));
  };

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
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Edit Moment</Text>
            <Text style={styles.subtitle}>Update your moment</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Song card */}
        {hasSong ? (
          <TouchableOpacity
            style={styles.songCard}
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: "/song-search",
                params: { returnTo: "edit", momentId: params.id },
              })
            }
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
          <TouchableOpacity
            style={styles.selectSongButton}
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: "/song-search",
                params: { returnTo: "edit", momentId: params.id },
              })
            }
          >
            <Text style={styles.selectSongButtonText}>Select Song</Text>
          </TouchableOpacity>
        )}

        {/* Reflection */}
        <View style={styles.reflectionLabelRow}>
          <Text style={[styles.sectionLabel, styles.reflectionLabel]}>Reflection</Text>
          <TouchableOpacity
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
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Write on a full page"
          >
            <Text style={styles.fullPageText}>Full page</Text>
          </TouchableOpacity>
        </View>
        <TextInput
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

        {/* Mood selector */}
        <Text style={styles.sectionLabel}>Mood</Text>
        <MoodSelector
          selectedMoods={selectedMoods}
          onChangeMoods={setSelectedMoods}
          customMoods={profile?.customMoods ?? []}
          saveCustomMood={saveCustomMood}
          deleteCustomMood={deleteCustomMood}
        />

        {/* People */}
        <Text style={styles.sectionLabel}>People</Text>
        <PeopleInput people={people} onChangePeople={setPeople} />

        {/* Photos */}
        <Text style={styles.sectionLabel}>Photos</Text>
        <TouchableOpacity
          style={styles.addPhotosButton}
          onPress={handleAddPhotos}
          activeOpacity={0.7}
        >
          <Text style={styles.addPhotosButtonText}>Add Photos</Text>
        </TouchableOpacity>
        {(existingPhotoUrls.length > 0 || newPhotos.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoScroll}
            contentContainerStyle={styles.photoScrollContent}
          >
            {existingPhotoUrls.map((url, index) => (
              <View key={`existing-${index}`} style={styles.photoThumbContainer}>
                <AppImage source={{ uri: url }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => handleRemoveExistingPhoto(index)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {newPhotos.map((uri) => (
              <View key={uri} style={styles.photoThumbContainer}>
                <AppImage source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => handleRemoveNewPhoto(uri)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
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
            onChange={handleDateChange}
            themeVariant={theme.isDark ? "dark" : "light"}
            accentColor={theme.colors.accent}
            style={styles.datePicker}
          />
        ) : (
          <Text style={styles.noDateText}>No specific date</Text>
        )}

        {/* Location */}
        <Text style={styles.sectionLabel}>Location</Text>
        <LocationField value={locationResult} onChange={setLocationResult} />

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
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
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
      padding: 20,
      paddingTop: 60,
      paddingBottom: 40,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 32,
    },
    title: {
      fontSize: 28,
      fontFamily: "DMSerifDisplay_400Regular",
      color: theme.colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
    },
    cancelText: {
      fontSize: 17,
      color: theme.colors.accent,
    },
    songCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      borderRadius: 12,
    },
    artwork: {
      width: 64,
      height: 64,
      borderRadius: 8,
    },
    songInfo: {
      flex: 1,
      marginLeft: 12,
    },
    songTitle: {
      fontSize: 16,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    changeText: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.textTertiary,
      marginLeft: 8,
    },
    selectSongButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    selectSongButtonText: {
      color: theme.colors.buttonText,
      fontSize: 17,
      fontFamily: "DMSans_600SemiBold",
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
    reflectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    reflectionLabel: {
      flex: 1,
    },
    fullPageText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      marginTop: 16,
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
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    addPhotosButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: "dashed",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    addPhotosButtonText: {
      fontSize: 15,
      fontFamily: "DMSans_500Medium",
      color: theme.colors.textSecondary,
    },
    photoScroll: {
      marginTop: 10,
      marginHorizontal: -20,
    },
    photoScrollContent: {
      paddingHorizontal: 20,
      gap: 10,
    },
    photoThumbContainer: {
      position: "relative",
    },
    photoThumb: {
      width: 80,
      height: 80,
      borderRadius: 8,
    },
    photoRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    photoRemoveText: {
      color: "#fff",
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
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
  });
}
