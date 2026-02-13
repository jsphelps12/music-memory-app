import { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ActionSheetIOS,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { uploadMomentPhoto } from "@/lib/storage";
import { MOODS } from "@/constants/Moods";
import { MoodOption, Song } from "@/types";

export default function CreateMomentScreen() {
  const router = useRouter();
  const { user } = useAuth();
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
    if (!hasSong) {
      setError("Please select a song.");
      return;
    }
    if (!reflection.trim()) {
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
      setError(e.message ?? "Failed to save moment.");
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>New Moment</Text>
        <Text style={styles.subtitle}>Capture a music memory</Text>

        {/* Song card */}
        {hasSong ? (
          <TouchableOpacity
            style={styles.songCard}
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
            onPress={() => router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } })}
          >
            <Text style={styles.selectSongButtonText}>Select Song</Text>
          </TouchableOpacity>
        )}

        {/* Reflection */}
        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={styles.reflectionInput}
          placeholder="What does this song remind you of?"
          placeholderTextColor="#999"
          multiline
          textAlignVertical="top"
          value={reflection}
          onChangeText={setReflection}
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
                onPress={() =>
                  setSelectedMood(isSelected ? null : mood.value)
                }
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
          style={styles.input}
          placeholder="Add people (comma-separated)"
          placeholderTextColor="#999"
          value={peopleInput}
          onChangeText={setPeopleInput}
          onBlur={handleAddPeople}
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
        <TouchableOpacity style={styles.addPhotosButton} onPress={handleAddPhotos}>
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
          themeVariant="light"
          accentColor="#000"
          style={styles.datePicker}
        />

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Moment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 80,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
  },
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 12,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  artworkPlaceholder: {
    backgroundColor: "#e0e0e0",
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  songArtist: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  changeText: {
    fontSize: 14,
    color: "#999",
    marginLeft: 8,
  },
  selectSongButton: {
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  selectSongButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginTop: 24,
    marginBottom: 8,
  },
  reflectionInput: {
    height: 120,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  moodScroll: {
    marginHorizontal: -20,
  },
  moodScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  moodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
  },
  moodChipSelected: {
    backgroundColor: "#000",
  },
  moodChipText: {
    fontSize: 14,
    color: "#333",
  },
  moodChipTextSelected: {
    color: "#fff",
  },
  peopleTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  personTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  personTagText: {
    fontSize: 14,
    color: "#333",
  },
  personTagRemove: {
    fontSize: 12,
    color: "#999",
  },
  addPhotosButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  addPhotosButtonText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
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
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  datePicker: {
    alignSelf: "center",
  },
  error: {
    color: "#d32f2f",
    fontSize: 14,
    marginTop: 16,
  },
  saveButton: {
    height: 48,
    backgroundColor: "#000",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
