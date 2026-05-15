import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getNowPlaying, onNowPlayingChange } from "@/lib/now-playing";
import { identifyAudio, stopShazamListening, type ShazamResult } from "@/modules/shazam-kit";
import { onSongSelected } from "@/lib/songEvents";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Song } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface SongPickerSectionProps {
  song: Song | null;
  onChange: (song: Song) => void;
  photos?: string[];
}

export function SongPickerSection({ song, onChange, photos = [] }: SongPickerSectionProps) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [nowPlayingSong, setNowPlayingSong] = useState<Song | null>(null);
  const [shazamResult, setShazamResult] = useState<ShazamResult | null>(null);
  const [isShazaming, setIsShazaming] = useState(false);
  const [shazamError, setShazamError] = useState("");

  useEffect(() => onSongSelected((s) => onChange(s)), [onChange]);

  useEffect(() => {
    if (song) return;

    let cancelled = false;
    getNowPlaying().then((nowPlaying) => {
      if (!cancelled && nowPlaying) setNowPlayingSong(nowPlaying);
    });

    const subscription = onNowPlayingChange((nowPlaying) => {
      if (!cancelled) setNowPlayingSong(nowPlaying);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [song]);

  const handleUseNowPlaying = () => {
    if (!nowPlayingSong) return;
    Haptics.selectionAsync();
    onChange(nowPlayingSong);
    setNowPlayingSong(null);
  };

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
    setShazamResult(null);
    try {
      const result = await identifyAudio();
      setShazamResult(result);
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

  const handleUseShazamResult = () => {
    if (!shazamResult) return;
    Haptics.selectionAsync();
    onChange({
      id: shazamResult.appleMusicId,
      title: shazamResult.title,
      artistName: shazamResult.artist,
      albumName: "",
      artworkUrl: shazamResult.artworkUrl,
      appleMusicId: shazamResult.appleMusicId,
      durationMs: 0,
    });
    setShazamResult(null);
    setShazamError("");
  };

  const goToSongSearch = () =>
    router.push({ pathname: "/song-search", params: { photos: JSON.stringify(photos) } });

  if (song) {
    return (
      <TouchableOpacity style={styles.songCard} activeOpacity={0.7} onPress={goToSongSearch}>
        {song.artworkUrl ? (
          <Image source={{ uri: song.artworkUrl }} style={styles.artwork} />
        ) : (
          <ArtworkPlaceholder style={styles.artwork} />
        )}
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={styles.songArtist} numberOfLines={1}>{song.artistName}</Text>
        </View>
        <Text style={styles.changeText}>Change</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      {/* Now Playing suggestion banner */}
      {nowPlayingSong && (
        <View style={styles.nowPlayingBanner}>
          <View style={styles.bannerContent}>
            {nowPlayingSong.artworkUrl ? (
              <Image source={{ uri: nowPlayingSong.artworkUrl }} style={styles.bannerArtwork} />
            ) : (
              <ArtworkPlaceholder style={styles.bannerArtwork} />
            )}
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerLabel}>Now Playing</Text>
              <Text style={styles.bannerTitle} numberOfLines={1}>{nowPlayingSong.title}</Text>
              <Text style={styles.bannerArtist} numberOfLines={1}>{nowPlayingSong.artistName}</Text>
            </View>
            <TouchableOpacity
              style={styles.bannerDismiss}
              onPress={() => setNowPlayingSong(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.bannerDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.useButton} activeOpacity={0.7} onPress={handleUseNowPlaying}>
            <Text style={styles.useButtonText}>Use this song</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.selectSongButton} activeOpacity={0.7} onPress={goToSongSearch}>
        <Text style={styles.selectSongButtonText}>Select Song</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.identifyButton, isShazaming && { borderColor: theme.colors.accent }]}
        activeOpacity={0.7}
        onPress={handleIdentify}
      >
        {isShazaming ? (
          <View style={styles.identifyRow}>
            <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginRight: 8 }} />
            <Text style={[styles.identifyButtonText, { color: theme.colors.accent }]}>
              Listening… Tap to cancel
            </Text>
          </View>
        ) : (
          <Text style={styles.identifyButtonText}>Identify Song</Text>
        )}
      </TouchableOpacity>

      {/* Shazam result banner */}
      {shazamResult && (
        <View style={styles.shazamBanner}>
          <View style={styles.bannerContent}>
            {shazamResult.artworkUrl ? (
              <Image source={{ uri: shazamResult.artworkUrl }} style={styles.bannerArtwork} />
            ) : (
              <ArtworkPlaceholder style={styles.bannerArtwork} />
            )}
            <View style={styles.bannerInfo}>
              <Text style={styles.shazamLabel}>Found</Text>
              <Text style={styles.bannerTitle} numberOfLines={1}>{shazamResult.title}</Text>
              <Text style={styles.bannerArtist} numberOfLines={1}>{shazamResult.artist}</Text>
            </View>
            <TouchableOpacity
              style={styles.bannerDismiss}
              onPress={() => { setShazamResult(null); setShazamError(""); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.bannerDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.useButton} activeOpacity={0.7} onPress={handleUseShazamResult}>
            <Text style={styles.useButtonText}>Use this song</Text>
          </TouchableOpacity>
        </View>
      )}

      {shazamError ? <Text style={styles.shazamError}>{shazamError}</Text> : null}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
    identifyButton: {
      marginTop: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
    },
    identifyRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    identifyButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textSecondary,
    },
    nowPlayingBanner: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    shazamBanner: {
      marginTop: theme.spacing.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    bannerContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    bannerArtwork: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.sm,
    },
    bannerInfo: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    bannerLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    shazamLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bannerTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
      marginTop: 1,
    },
    bannerArtist: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    bannerDismiss: {
      padding: theme.spacing.xs,
    },
    bannerDismissText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    useButton: {
      marginTop: theme.spacing.sm,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    useButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
    },
    shazamError: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
    },
  });
}
