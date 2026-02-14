import { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ActionSheetIOS,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { uploadMomentPhoto } from "@/lib/storage";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MoodOption, Song } from "@/types";
import { friendlyError } from "@/lib/errors";

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  }>();

  const [song, setSong] = useState<Song | null>(null);

  // Sync song from search params when returning from song-search modal
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

  // Restore photos from params after song-search navigation
  useEffect(() => {
    if (params.photos) {
      try {
        const restored = JSON.parse(params.photos) as string[];
        if (restored.length > 0) setPhotos(restored);
      } catch {}
    }
  }, [params.photos]);

  const hasSong = !!song;

  const [reflection, setReflection] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodOption | null>(null);
  const [peopleInput, setPeopleInput] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");

  const handleAddPeople = () => {
    const names = peopleInput
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !people.includes(n));
    if (names.length > 0) {
      setPeople([...people, ...names]);
    }
    setPeopleInput("");
  };

  const handleRemovePerson = (name: string) => {
    setPeople(people.filter((p) => p !== name));
  };

  const handleAddPhotos = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Library"],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;

        if (buttonIndex === 1) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            setError("Camera permission is required to take photos.");
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            quality: 0.8,
          });
        }

        if (result && !result.canceled) {
          const uris = result.assets.map((a) => a.uri);
          setPhotos((prev) => [...prev, ...uris]);
        }
      }
    );
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) {
      setMomentDate(date);
    }
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasSong) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please select a song.");
      return;
    }
    if (!reflection.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please write a reflection.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const previewUrl = await fetchPreviewUrl(song!.appleMusicId);

      const photoPaths = await Promise.all(
        photos.map((uri) => uploadMomentPhoto(user!.id, uri))
      );

      const { error: insertError } = await supabase.from("moments").insert({
        user_id: user!.id,
        song_title: song!.title,
        song_artist: song!.artistName,
        song_album_name: song!.albumName || null,
        song_artwork_url: song!.artworkUrl || null,
        song_apple_music_id: song!.appleMusicId,
        song_preview_url: previewUrl,
        reflection_text: reflection.trim(),
        mood: selectedMood,
        people,
        photo_urls: photoPaths,
        location: null,
        moment_date: momentDate.toISOString().split("T")[0],
      });

      if (insertError) throw insertError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSong(null);
      setReflection("");
      setSelectedMood(null);
      setPeopleInput("");
      setPeople([]);
      setPhotos([]);
      setMomentDate(new Date());
      setError("");

      router.replace("/(tabs)");
    } catch (e: any) {
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
        <Text style={styles.title}>Capture a Moment</Text>

        {/* Song card */}
        {hasSong ? (
          <TouchableOpacity
            style={styles.songCard}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } })}
          >
            {song!.artworkUrl ? (
              <Image
                source={{ uri: song!.artworkUrl }}
                style={styles.artwork}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
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
            onPress={() => router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } })}
          >
            <Text style={styles.selectSongButtonText}>Select Song</Text>
          </TouchableOpacity>
        )}

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={[styles.reflectionInput, focusedField === "reflection" && { borderColor: theme.colors.accent }]}
          placeholder="What does this song remind you of?"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          multiline
          textAlignVertical="top"
          value={reflection}
          onChangeText={setReflection}
          onFocus={() => setFocusedField("reflection")}
          onBlur={() => setFocusedField("")}
        />

        {/* Mood selector */}
        <Text style={styles.sectionLabel}>Mood</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.moodScroll}
          contentContainerStyle={styles.moodScrollContent}
        >
          {MOODS.map((mood) => {
            const isSelected = selectedMood === mood.value;
            return (
              <TouchableOpacity
                key={mood.value}
                style={[styles.moodChip, isSelected && styles.moodChipSelected]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedMood(isSelected ? null : mood.value);
                }}
              >
                <Text
                  style={[
                    styles.moodChipText,
                    isSelected && styles.moodChipTextSelected,
                  ]}
                >
                  {mood.emoji} {mood.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* People tags */}
        <Text style={styles.sectionLabel}>People</Text>
        <TextInput
          style={[styles.input, focusedField === "people" && { borderColor: theme.colors.accent }]}
          placeholder="Add people (comma-separated)"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          value={peopleInput}
          onChangeText={setPeopleInput}
          onBlur={() => { setFocusedField(""); handleAddPeople(); }}
          onFocus={() => setFocusedField("people")}
          onSubmitEditing={handleAddPeople}
          returnKeyType="done"
        />
        {people.length > 0 && (
          <View style={styles.peopleTags}>
            {people.map((name) => (
              <View key={name} style={styles.personTag}>
                <Text style={styles.personTagText}>{name}</Text>
                <TouchableOpacity onPress={() => handleRemovePerson(name)}>
                  <Text style={styles.personTagRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Photos */}
        <Text style={styles.sectionLabel}>Photos</Text>
        <TouchableOpacity style={styles.addPhotosButton} activeOpacity={0.7} onPress={handleAddPhotos}>
          <Text style={styles.addPhotosButtonText}>Add Photos</Text>
        </TouchableOpacity>
        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoScroll}
            contentContainerStyle={styles.photoScrollContent}
          >
            {photos.map((uri) => (
              <View key={uri} style={styles.photoThumbContainer}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => handleRemovePhoto(uri)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Date picker */}
        <Text style={styles.sectionLabel}>Date</Text>
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
    title: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing["2xl"],
    },
    songCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundSecondary,
      padding: theme.spacing.md,
      borderRadius: theme.radii.md,
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
      marginTop: 2,
    },
    changeText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginLeft: theme.spacing.sm,
    },
    selectSongButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: theme.spacing.lg,
      borderRadius: theme.radii.md,
      alignItems: "center",
    },
    selectSongButtonText: {
      color: theme.colors.buttonText,
      fontSize: 17,
      fontWeight: theme.fontWeight.semibold,
    },
    sectionLabel: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    reflectionInput: {
      height: 120,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    moodScroll: {
      marginHorizontal: -theme.spacing.xl,
    },
    moodScrollContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    moodChip: {
      paddingHorizontal: 14,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.chipBg,
    },
    moodChipSelected: {
      backgroundColor: theme.colors.chipSelectedBg,
    },
    moodChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    moodChipTextSelected: {
      color: theme.colors.chipSelectedText,
    },
    peopleTags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    personTag: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.chipBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      gap: 6,
    },
    personTagText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    personTagRemove: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    addPhotosButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: "dashed",
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    addPhotosButtonText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.medium,
    },
    photoScroll: {
      marginTop: 10,
      marginHorizontal: -theme.spacing.xl,
    },
    photoScrollContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoThumbContainer: {
      position: "relative",
    },
    photoThumb: {
      width: 80,
      height: 80,
      borderRadius: theme.radii.sm,
    },
    photoRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    photoRemoveText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: theme.fontWeight.semibold,
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
      height: 48,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: 10,
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
  });
}
