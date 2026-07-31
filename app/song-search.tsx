import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import { CloseButton } from "@/components/CloseButton";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProvider } from "@/lib/providers";
import { emitSongSelected } from "@/lib/songEvents";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import type { Song } from "@/types";

export default function SongSearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // Full-screen presentation puts the header under the status bar; the inset
  // is device state, not theme, so it stays out of createStyles.
  const headerStyle = [styles.header, { paddingTop: insets.top + theme.spacing.sm }];
  const posthog = usePostHog();
  const { photos } = useLocalSearchParams<{ photos?: string }>();
  const { preferredProvider } = useAuth();
  const provider = getProvider(preferredProvider);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = usePlayer();
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState<Record<string, boolean>>({});
  // Preview URLs are fetched per song on first tap; cache so replays are instant.
  const previewUrlCache = useRef(new Map<string, string | null>());
  // Only tear down playback we started — entering and cancelling out of this
  // screen must not kill full playback the user had going beforehand.
  const startedPreviewRef = useRef(false);

  useEffect(() => {
    return () => {
      if (startedPreviewRef.current) void player.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePreviewPress(song: Song) {
    if (player.isPreview && player.currentSong?.id === song.id) {
      if (player.isPlaying) player.pause();
      else player.resume();
      return;
    }
    if (previewUnavailable[song.id] || previewLoadingId) return;

    Haptics.selectionAsync();
    setPreviewLoadingId(song.id);
    try {
      let url = previewUrlCache.current.get(song.id);
      if (url === undefined) {
        url = await provider.fetchPreviewUrl(song);
        previewUrlCache.current.set(song.id, url);
      }
      if (!url) {
        setPreviewUnavailable((prev) => ({ ...prev, [song.id]: true }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      startedPreviewRef.current = true;
      await player.playPreview(song, url);
      posthog.capture("song_preview_played", { provider: song.provider });
    } finally {
      setPreviewLoadingId(null);
    }
  }

  useEffect(() => {
    provider.isAvailable().then((ok) => setAuthorized(ok));
  }, [preferredProvider]);

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
        const songs = await provider.search(trimmed);
        setResults(songs);
        posthog.capture("song_searched", { query_length: trimmed.length, result_count: songs.length, provider: preferredProvider });
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
  }, [query, retryKey, preferredProvider]);

  function handleSelect(song: Song) {
    if (startedPreviewRef.current) {
      startedPreviewRef.current = false;
      void player.stop();
    }
    Haptics.selectionAsync();
    posthog.capture("song_selected", { song_title: song.title, song_artist: song.artistName });
    emitSongSelected(song);
    router.back();
  }

  if (!authorized) {
    return (
      <View style={styles.container}>
        <View style={headerStyle}>
          <CloseButton onPress={() => router.back()} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Music access is required to search songs.
          </Text>
          <Text style={styles.emptySubtext}>
            Please enable Music access in Settings.
          </Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={headerStyle}>
        <CloseButton onPress={() => router.back()} />
      </View>

      <TextInput
        testID="song-search-input"
        style={styles.searchInput}
        placeholder="Search for a song..."
        placeholderTextColor={theme.colors.placeholder}
        cursorColor={theme.colors.accent}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.text} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setRetryKey((k) => k + 1)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
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
          renderItem={({ item, index }) => (
            <TouchableOpacity
              // Indexed so the E2E flow can tap the first result deterministically
              // without depending on which song the Apple Music catalog returns.
              testID={`song-search-result-${index}`}
              style={styles.row}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <TouchableOpacity
                testID={`song-search-preview-${index}`}
                onPress={() => handlePreviewPress(item)}
                activeOpacity={0.7}
                disabled={!!previewUnavailable[item.id]}
              >
                {item.artworkUrl ? (
                  <AppImage
                    source={{ uri: item.artworkUrl }}
                    style={styles.artwork}
                  />
                ) : (
                  <ArtworkPlaceholder style={styles.artwork} />
                )}
                {previewUnavailable[item.id] ? null : (
                  <View style={styles.previewBadge}>
                    {previewLoadingId === item.id ? (
                      <ActivityIndicator size={10} color="#fff" />
                    ) : (
                      <Ionicons
                        name={
                          player.isPreview &&
                          player.currentSong?.id === item.id &&
                          player.isPlaying
                            ? "pause"
                            : "play"
                        }
                        size={11}
                        color="#fff"
                      />
                    )}
                  </View>
                )}
              </TouchableOpacity>
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
    searchInput: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
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
    errorText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
      textAlign: "center",
    },
    retryButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing["2xl"],
      borderRadius: theme.radii.md,
      marginTop: theme.spacing.lg,
    },
    retryButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    settingsButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing["2xl"],
      borderRadius: theme.radii.md,
      marginTop: theme.spacing.lg,
    },
    settingsButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
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
    previewBadge: {
      position: "absolute",
      bottom: 2,
      right: 2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    songInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
}
