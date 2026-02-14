import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/lib/supabase";
import { getSignedPhotoUrl } from "@/lib/storage";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { Moment, MoodOption } from "@/types";

export default function MomentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { currentSong, isPlaying, play, pause, stop } = usePlayer();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoSignedUrls, setPhotoSignedUrls] = useState<string[]>([]);

  const fetchMoment = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", id)
      .single();

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
      songPreviewUrl: row.song_preview_url ?? null,
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
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchMoment();
    }, [fetchMoment])
  );

  useEffect(() => {
    if (!moment || moment.photoUrls.length === 0) {
      setPhotoSignedUrls([]);
      return;
    }
    let cancelled = false;
    Promise.all(moment.photoUrls.map((path) => getSignedPhotoUrl(path))).then(
      (urls) => {
        if (!cancelled) {
          setPhotoSignedUrls(urls.filter((u): u is string => u !== null));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [moment?.photoUrls]);

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
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View />
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        <SkeletonMomentDetail />
      </View>
    );
  }

  if (error || !moment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || "Moment not found"}</Text>
        <TouchableOpacity onPress={fetchMoment} style={styles.retryLink}>
          <Text style={styles.retryLinkText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mood = getMood(moment.mood);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/moment/edit/${moment.id}`)}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

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

        {moment.songPreviewUrl ? (
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => {
              const isCurrentSong =
                isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId;
              if (isCurrentSong) {
                pause();
              } else {
                play(
                  {
                    id: moment.songAppleMusicId,
                    title: moment.songTitle,
                    artistName: moment.songArtist,
                    albumName: moment.songAlbumName,
                    artworkUrl: moment.songArtworkUrl,
                    appleMusicId: moment.songAppleMusicId,
                    durationMs: 0,
                  },
                  moment.songPreviewUrl!
                );
              }
            }}
          >
            <Text style={styles.playButtonText}>
              {isPlaying && currentSong?.appleMusicId === moment.songAppleMusicId
                ? "Pause"
                : "Play Preview"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {photoSignedUrls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoGallery}
            contentContainerStyle={styles.photoGalleryContent}
          >
            {photoSignedUrls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.photoImage}
              />
            ))}
          </ScrollView>
        )}

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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      padding: theme.spacing.xl,
    },
    errorText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    backLink: {
      paddingVertical: theme.spacing.sm,
    },
    backLinkText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
    },
    retryLink: {
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    retryLinkText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    topBar: {
      paddingTop: 60,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    editButton: {
      paddingVertical: 6,
      paddingHorizontal: theme.spacing.md,
    },
    editButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.closeButtonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.semibold,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 60,
    },
    artwork: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.lg,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    songTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.xl,
    },
    playButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.buttonBg,
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: 10,
      borderRadius: theme.radii.lg,
      marginBottom: theme.spacing.xl,
    },
    playButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    photoGallery: {
      marginBottom: theme.spacing.xl,
      marginHorizontal: -theme.spacing.xl,
    },
    photoGalleryContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    photoImage: {
      width: 200,
      height: 200,
      borderRadius: theme.radii.md,
    },
    reflection: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      lineHeight: 24,
      marginBottom: theme.spacing.xl,
    },
    moodChip: {
      alignSelf: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      backgroundColor: theme.colors.chipBg,
      marginBottom: theme.spacing.lg,
    },
    moodChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    peopleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    personChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      backgroundColor: theme.colors.accentBg,
    },
    personChipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accentText,
    },
    date: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginBottom: theme.spacing["3xl"],
    },
    deleteButton: {
      alignSelf: "center",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing["2xl"],
    },
    deleteButtonText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
      fontWeight: theme.fontWeight.medium,
    },
  });
}
