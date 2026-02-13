import { useState } from "react";
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
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { MOODS } from "@/constants/Moods";
import { MoodOption } from "@/types";

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
  }>();

  const hasSong = !!params.songTitle;

  const [reflection, setReflection] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodOption | null>(null);
  const [peopleInput, setPeopleInput] = useState("");
  const [people, setPeople] = useState<string[]>([]);
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
      const previewUrl = await fetchPreviewUrl(params.songAppleMusicId!);

      const { error: insertError } = await supabase.from("moments").insert({
        user_id: user!.id,
        song_title: params.songTitle,
        song_artist: params.songArtist,
        song_album_name: params.songAlbum ?? null,
        song_artwork_url: params.songArtwork ?? null,
        song_apple_music_id: params.songAppleMusicId,
        song_preview_url: previewUrl,
        reflection_text: reflection.trim(),
        mood: selectedMood,
        people,
        photo_urls: [],
        location: null,
        moment_date: momentDate.toISOString().split("T")[0],
      });

      if (insertError) throw insertError;

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
            onPress={() => router.push("/song-search")}
          >
            {params.songArtwork ? (
              <Image
                source={{ uri: params.songArtwork }}
                style={styles.artwork}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {params.songTitle}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {params.songArtist}
              </Text>
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.selectSongButton}
            onPress={() => router.push("/song-search")}
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
