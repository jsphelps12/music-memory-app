import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { requestMusicAuthorization, searchSongs } from "@/lib/musickit";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import type { Song } from "@/types";

export default function SongSearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { photos, returnTo, momentId } = useLocalSearchParams<{
    photos?: string;
    returnTo?: string;
    momentId?: string;
  }>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestMusicAuthorization().then((ok) => setAuthorized(ok));
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    timerRef.current = setTimeout(async () => {
      try {
        const songs = await searchSongs(trimmed);
        setResults(songs);
      } catch {
        setResults([]);
        setError("Something went wrong. Try again.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  function handleSelect(song: Song) {
    const songParams = {
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artistName,
      songAlbum: song.albumName,
      songArtwork: song.artworkUrl,
      songAppleMusicId: song.appleMusicId,
      songDurationMs: String(song.durationMs),
    };

    if (returnTo === "edit" && momentId) {
      router.replace({
        pathname: "/moment/edit/[id]",
        params: { id: momentId, ...songParams },
      });
    } else {
      router.replace({
        pathname: "/(tabs)/create",
        params: { ...songParams, ...(photos ? { photos } : {}) },
      });
    }
  }

  if (!authorized) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Music access is required to search songs.
          </Text>
          <Text style={styles.emptySubtext}>
            Please enable Music access in Settings.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search for a song..."
        placeholderTextColor={theme.colors.placeholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
        returnKeyType="search"
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.text} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : results.length === 0 && query.trim().length >= 2 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No results for "{query.trim()}"</Text>
          <Text style={styles.emptySubtext}>Try a different search</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.hintText}>Search by song title or artist</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleSelect(item)}
            >
              {item.artworkUrl ? (
                <Image
                  source={{ uri: item.artworkUrl }}
                  style={styles.artwork}
                />
              ) : (
                <View style={[styles.artwork, styles.artworkPlaceholder]} />
              )}
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.songArtist} numberOfLines={1}>
                  {item.artistName}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
    },
    cancelText: {
      fontSize: 17,
      color: theme.colors.text,
    },
    searchInput: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: 10,
      backgroundColor: theme.colors.backgroundTertiary,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
    },
    emptyText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    emptySubtext: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing.sm,
    },
    hintText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textTertiary,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: 10,
    },
    artwork: {
      width: 48,
      height: 48,
      borderRadius: 6,
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
  });
}
