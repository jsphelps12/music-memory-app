import { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOODS } from "@/constants/Moods";
import { Moment, MoodOption } from "@/types";

export default function MomentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchMoment() {
        setLoading(true);
        setError("");
        const { data, error: fetchError } = await supabase
          .from("moments")
          .select("*")
          .eq("id", id)
          .single();

        if (cancelled) return;

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        const row: any = data;
        setMoment({
          id: row.id,
          userId: row.user_id,
          songTitle: row.song_title,
          songArtist: row.song_artist,
          songAlbumName: row.song_album_name,
          songArtworkUrl: row.song_artwork_url,
          songAppleMusicId: row.song_apple_music_id,
          reflectionText: row.reflection_text,
          photoUrls: row.photo_urls ?? [],
          mood: row.mood,
          people: row.people ?? [],
          location: row.location,
          momentDate: row.moment_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
        setLoading(false);
      }

      fetchMoment();
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getMood = (value: MoodOption | null) =>
    value ? MOODS.find((m) => m.value === value) : undefined;

  const handleDelete = () => {
    Alert.alert("Delete Moment", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error: deleteError } = await supabase
            .from("moments")
            .delete()
            .eq("id", id);

          if (deleteError) {
            Alert.alert("Error", deleteError.message);
            return;
          }

          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error || !moment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || "Moment not found"}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mood = getMood(moment.mood);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {moment.songArtworkUrl ? (
          <Image
            source={{ uri: moment.songArtworkUrl }}
            style={styles.artwork}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}

        <Text style={styles.songTitle}>{moment.songTitle}</Text>
        <Text style={styles.songArtist}>{moment.songArtist}</Text>

        {moment.reflectionText ? (
          <Text style={styles.reflection}>{moment.reflectionText}</Text>
        ) : null}

        {mood ? (
          <View style={styles.moodChip}>
            <Text style={styles.moodChipText}>
              {mood.emoji} {mood.label}
            </Text>
          </View>
        ) : null}

        {moment.people.length > 0 ? (
          <View style={styles.peopleRow}>
            {moment.people.map((person) => (
              <View key={person} style={styles.personChip}>
                <Text style={styles.personChipText}>{person}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.date}>{formatDate(moment.momentDate)}</Text>

        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete Moment</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    textAlign: "center",
    marginBottom: 16,
  },
  backLink: {
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 16,
    color: "#007AFF",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  artwork: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  artworkPlaceholder: {
    backgroundColor: "#e0e0e0",
  },
  songTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#000",
  },
  songArtist: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
    marginBottom: 20,
  },
  reflection: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    marginBottom: 20,
  },
  moodChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    marginBottom: 16,
  },
  moodChipText: {
    fontSize: 14,
    color: "#333",
  },
  peopleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  personChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e8f0fe",
  },
  personChipText: {
    fontSize: 14,
    color: "#1a73e8",
  },
  date: {
    fontSize: 14,
    color: "#999",
    marginBottom: 32,
  },
  deleteButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  deleteButtonText: {
    fontSize: 16,
    color: "#d32f2f",
    fontWeight: "500",
  },
});
