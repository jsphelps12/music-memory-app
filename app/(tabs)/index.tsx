import { useCallback, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOODS } from "@/constants/Moods";
import { Moment, MoodOption } from "@/types";

export default function TimelineScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchMoments() {
        setLoading(true);
        setError("");
        const { data, error: fetchError } = await supabase
          .from("moments")
          .select("*")
          .eq("user_id", user!.id)
          .order("moment_date", { ascending: false });

        if (cancelled) return;

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        const mapped: Moment[] = (data ?? []).map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          songTitle: row.song_title,
          songArtist: row.song_artist,
          songAlbumName: row.song_album_name,
          songArtworkUrl: row.song_artwork_url,
          songAppleMusicId: row.song_apple_music_id,
          songPreviewUrl: row.song_preview_url ?? null,
          reflectionText: row.reflection_text,
          photoUrls: row.photo_urls ?? [],
          mood: row.mood,
          people: row.people ?? [],
          location: row.location,
          momentDate: row.moment_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        setMoments(mapped);
        setLoading(false);
      }

      fetchMoments();
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getMood = (value: MoodOption | null) =>
    value ? MOODS.find((m) => m.value === value) : undefined;

  const renderMoment = ({ item }: { item: Moment }) => {
    const mood = getMood(item.mood);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/moment/${item.id}`)}
      >
        {item.songArtworkUrl ? (
          <Image
            source={{ uri: item.songArtworkUrl }}
            style={styles.artwork}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}
        <View style={styles.cardContent}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {item.songTitle}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {item.songArtist}
          </Text>
          {item.reflectionText ? (
            <Text style={styles.reflection} numberOfLines={2}>
              {item.reflectionText}
            </Text>
          ) : null}
          <View style={styles.cardMeta}>
            {mood ? (
              <View style={styles.moodChip}>
                <Text style={styles.moodChipText}>
                  {mood.emoji} {mood.label}
                </Text>
              </View>
            ) : null}
            <Text style={styles.date}>{formatDate(item.momentDate)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.subtitle}>Your music moments</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : moments.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No moments yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first music memory
          </Text>
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={renderMoment}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 16,
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
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  artworkPlaceholder: {
    backgroundColor: "#e0e0e0",
  },
  cardContent: {
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
    marginTop: 1,
  },
  reflection: {
    fontSize: 14,
    color: "#444",
    marginTop: 6,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  moodChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#e8e8e8",
  },
  moodChipText: {
    fontSize: 12,
    color: "#333",
  },
  date: {
    fontSize: 12,
    color: "#999",
  },
});
