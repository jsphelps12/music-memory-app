import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getNowPlaying, onNowPlayingChange } from "@/lib/now-playing";
import { getProvider } from "@/lib/providers";
import { identifyAudio, stopShazamListening } from "@/modules/shazam-kit";
import { onSongSelected } from "@/lib/songEvents";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Theme } from "@/constants/theme";

interface SongPickerSectionProps {
  song: Song | null;
  onChange: (song: Song) => void;
  photos?: string[];
  /**
   * Pick up whatever the system player is playing when no song is chosen yet.
   * Off when another source is about to supply the song (share-intent
   * candidates), so the two can't race.
   */
  suggestNowPlaying?: boolean;
  /** Start listening on mount (the widget's Identify tile and control). */
  autoIdentify?: boolean;
}

export function SongPickerSection({ song, onChange, photos = [], suggestNowPlaying = true, autoIdentify = false }: SongPickerSectionProps) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const { preferredProvider } = useAuth();

  // The song we filled in from the system player, so the header can say
  // "Playing now" until the user picks something else.
  const [fromNowPlaying, setFromNowPlaying] = useState<Song | null>(null);
  const [isShazaming, setIsShazaming] = useState(false);
  const [shazamError, setShazamError] = useState("");
  const songRef = useRef(song);
  songRef.current = song;

  useEffect(() => onSongSelected((s) => onChange(s)), [onChange]);

  // Phase 1 (2026-10): the playing song is the default, not a banner to
  // accept. It only fills an empty picker and stops listening once a song is
  // set, so the track changing mid-entry never swaps the song under the user.
  const applyNowPlaying = useCallback(async (nowPlaying: Song) => {
    onChange(nowPlaying);
    setFromNowPlaying(nowPlaying);
    if (nowPlaying.appleMusicId) return;
    // The system player sometimes reports a track without a catalog id;
    // look it up so the preview and the Apple Music link work.
    try {
      const query = [nowPlaying.title, nowPlaying.artistName].filter(Boolean).join(" ");
      const results = await getProvider('apple_music').search(query);
      const match = results.find((r) => r.title.toLowerCase() === nowPlaying.title.toLowerCase());
      if (match && songRef.current === nowPlaying) {
        const resolved = { ...nowPlaying, appleMusicId: match.appleMusicId, durationMs: match.durationMs || nowPlaying.durationMs };
        onChange(resolved);
        setFromNowPlaying(resolved);
      }
    } catch {}
  }, [onChange]);

  useEffect(() => {
    // MPMusicPlayerController only reflects Apple Music system player
    if (song || !suggestNowPlaying || preferredProvider !== 'apple_music') return;

    let cancelled = false;
    const use = (nowPlaying: Song | null) => {
      if (!cancelled && nowPlaying && !songRef.current) applyNowPlaying(nowPlaying);
    };
    getNowPlaying().then(use);
    const subscription = onNowPlayingChange(use);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [song, suggestNowPlaying, preferredProvider, applyNowPlaying]);

  const handleIdentify = async () => {
    if (isShazaming) {
      stopShazamListening().catch(() => {});
      setIsShazaming(false);
      return;
    }
    posthog.capture("shazam_used");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsShazaming(true);
    setShazamError("");
    try {
      const result = await identifyAudio();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (preferredProvider === 'spotify') {
        // Shazam returns Apple Music IDs — cross-search Spotify to find the spotifyId
        try {
          const query = [result.title, result.artist].filter(Boolean).join(" ");
          const results = await getProvider('spotify').search(query);
          const match = results.find((r) => r.title.toLowerCase() === result.title.toLowerCase()) ?? results[0];
          if (match) {
            onChange(match);
            return;
          }
        } catch {}
      }

      // Asking to identify is the choice, so the match goes straight in;
      // "Different song" is right there if it's wrong.
      onChange({
        id: result.appleMusicId,
        title: result.title,
        artistName: result.artist,
        albumName: "",
        artworkUrl: result.artworkUrl,
        provider: 'apple_music',
        appleMusicId: result.appleMusicId,
        spotifyId: null,
        durationMs: 0,
      });
    } catch (e: any) {
      const code = e?.code ?? "";
      if (code !== "CANCELLED") {
        setShazamError(
          code === "TIMEOUT"
            ? "Couldn't identify the song. Try again."
            : "Microphone error. Check permissions."
        );
      }
    } finally {
      setIsShazaming(false);
    }
  };

  // Once, on mount, and only into an empty picker.
  const autoIdentifyRan = useRef(false);
  useEffect(() => {
    if (!autoIdentify || autoIdentifyRan.current || songRef.current) return;
    autoIdentifyRan.current = true;
    void handleIdentify();
    // handleIdentify is recreated each render; this is a one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIdentify]);

  const goToSongSearch = () =>
    router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } });

  const isPlayingNow = !!song && song === fromNowPlaying;
  const subtitle = song ? [song.artistName, song.albumName].filter(Boolean).join(" · ") : "";

  return (
    <View>
      {isPlayingNow ? (
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrow}>Playing now</Text>
        </View>
      ) : null}

      {song ? (
        <TouchableOpacity
          style={[styles.songRow, isPlayingNow && styles.songRowBelowEyebrow]}
          activeOpacity={0.7}
          onPress={goToSongSearch}
          accessibilityRole="button"
          accessibilityLabel={`${song.title} by ${song.artistName}. Change song`}
        >
          {song.artworkUrl ? (
            <AppImage source={{ uri: song.artworkUrl }} style={styles.artwork} />
          ) : (
            <ArtworkPlaceholder style={styles.artwork} />
          )}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
            {subtitle ? <Text style={styles.songArtist} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.songRow}
          activeOpacity={0.7}
          onPress={goToSongSearch}
          accessibilityRole="button"
          accessibilityLabel="Choose a song"
        >
          <View style={[styles.artwork, styles.emptyArtwork]}>
            <Ionicons name="musical-notes-outline" size={26} color={theme.colors.textTertiary} />
          </View>
          <View style={styles.songInfo}>
            <Text style={styles.songTitle}>Choose a song</Text>
            <Text style={styles.songArtist}>Search, or identify what's playing nearby</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          testID={song ? "create-change-song" : "create-select-song"}
          style={styles.pill}
          activeOpacity={0.7}
          onPress={goToSongSearch}
        >
          <Ionicons name="search" size={15} color={theme.colors.text} />
          <Text style={styles.pillText}>{song ? "Different song" : "Search"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pill}
          activeOpacity={0.7}
          onPress={handleIdentify}
          accessibilityLabel={isShazaming ? "Listening. Tap to stop" : "Identify the song playing nearby"}
        >
          {isShazaming ? (
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          ) : (
            <Ionicons name="pulse" size={15} color={theme.colors.text} />
          )}
          <Text style={styles.pillText}>{isShazaming ? "Listening… tap to stop" : "Identify"}</Text>
        </TouchableOpacity>
      </View>

      {shazamError ? <Text style={styles.shazamError}>{shazamError}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    eyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    eyebrow: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    songRowBelowEyebrow: {
      marginTop: theme.spacing.md,
    },
    artwork: {
      width: 72,
      height: 72,
      borderRadius: 10,
    },
    emptyArtwork: {
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    songInfo: {
      flex: 1,
    },
    songTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 3,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    pill: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    pillText: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    shazamError: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.destructive,
    },
  });
}
