import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getNowPlaying, onNowPlayingChange } from "@/lib/now-playing";
import { getProvider } from "@/lib/providers";
import { identifyAudio, stopShazamListening } from "@/modules/shazam-kit";
import { setAudioModeAsync } from "expo-audio";
import { onSongSelected } from "@/lib/songEvents";
import { lookupItunesSong } from "@/lib/itunes";
import { persistableArtworkUrl } from "@/lib/momentRow";
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

  // A song chosen any other way makes an earlier Identify failure moot.
  useEffect(() => {
    if (song) setShazamError("");
  }, [song]);

  // Phase 1 (2026-10): the playing song is the default, not a banner to
  // accept. It only fills an empty picker and stops listening once a song is
  // set, so the track changing mid-entry never swaps the song under the user.
  const applyNowPlaying = useCallback(async (nowPlaying: Song) => {
    onChange(nowPlaying);
    setFromNowPlaying(nowPlaying);
    // Artwork from the system player can be the image itself (a data: URI
    // from older binaries) rather than a link; swap in the catalog URL, which
    // is what gets saved and shared.
    const needsArtwork = !persistableArtworkUrl(nowPlaying.artworkUrl);
    if (nowPlaying.appleMusicId && !needsArtwork) return;
    try {
      let match: Song | null | undefined;
      if (nowPlaying.appleMusicId) {
        match = await lookupItunesSong(nowPlaying.appleMusicId);
      } else {
        // The system player sometimes reports a track without a catalog id;
        // look it up so the preview and the Apple Music link work.
        const query = [nowPlaying.title, nowPlaying.artistName].filter(Boolean).join(" ");
        const results = await getProvider('apple_music').search(query);
        match = results.find((r) => r.title.toLowerCase() === nowPlaying.title.toLowerCase());
      }
      if (match && songRef.current === nowPlaying) {
        const resolved = {
          ...nowPlaying,
          appleMusicId: nowPlaying.appleMusicId ?? match.appleMusicId,
          durationMs: match.durationMs || nowPlaying.durationMs,
          artworkUrl: needsArtwork ? match.artworkUrl : nowPlaying.artworkUrl,
        };
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
      // Listening switches the shared audio session to record-only, and
      // binaries before the native fix don't switch it back, which leaves
      // previews silent. Re-apply the app's playback mode (the same one
      // PlayerContext sets at launch).
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
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
      {song ? (
        <Pressable
          style={({ pressed }) => [styles.songRow, pressed && styles.pressed]}
          onPress={goToSongSearch}
          accessibilityRole="button"
          accessibilityLabel={`${song.title} by ${song.artistName}${isPlayingNow ? ", playing now" : ""}. Change song`}
        >
          {song.artworkUrl ? (
            <AppImage source={{ uri: song.artworkUrl }} style={styles.artwork} />
          ) : (
            <ArtworkPlaceholder style={styles.artwork} />
          )}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
            {subtitle ? <Text style={styles.songArtist} numberOfLines={1}>{subtitle}</Text> : null}
            {/* A quiet meta line, not an eyebrow: the dot is the view's one
                terracotta signal. */}
            {isPlayingNow ? (
              <View style={styles.playingRow}>
                <View style={styles.liveDot} />
                <Text style={styles.playingText}>Playing now</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.songRow, pressed && styles.pressed]}
          onPress={goToSongSearch}
          accessibilityRole="button"
          accessibilityLabel="Choose a song"
        >
          <View style={[styles.artwork, styles.emptyArtwork]}>
            <Ionicons name="musical-notes-outline" size={26} color={theme.colors.textTertiary} />
          </View>
          <View style={styles.songInfo}>
            <Text style={styles.songTitle}>Choose a song</Text>
            <Text style={styles.songArtist}>Search, or identify what&apos;s playing nearby</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Button
          testID={song ? "create-change-song" : "create-select-song"}
          label={song ? "Different song" : "Search"}
          icon="search"
          variant="secondary"
          size="pill"
          onPress={goToSongSearch}
        />
        <Button
          label={isShazaming ? "Listening… tap to stop" : "Identify"}
          icon={isShazaming ? undefined : "pulse"}
          variant="secondary"
          size="pill"
          onPress={handleIdentify}
          accessibilityLabel={isShazaming ? "Listening. Tap to stop" : "Identify the song playing nearby"}
          trailing={
            isShazaming ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : undefined
          }
        />
      </View>

      {shazamError ? <Text style={styles.shazamError}>{shazamError}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    pressed: { opacity: 0.7 },
    artwork: {
      width: 72,
      height: 72,
      borderRadius: theme.radii.sm,
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
      ...theme.typography.title,
      color: theme.colors.text,
    },
    songArtist: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    playingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: theme.spacing.xs,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.accent,
    },
    playingText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    shazamError: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.sm,
    },
  });
}
