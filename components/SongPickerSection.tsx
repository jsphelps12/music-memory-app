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
import { searchSongs } from "@/lib/musickit";
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

  const handleUseNowPlaying = async () => {
    if (!nowPlayingSong) return;
    Haptics.selectionAsync();

    let song = nowPlayingSong;
    if (!song.appleMusicId) {
      try {
        const query = [song.title, song.artistName].filter(Boolean).join(" ");
        const results = await searchSongs(query);
        const match = results.find((r) => r.title.toLowerCase() === song.title.toLowerCase());
        if (match) {
          song = { ...song, appleMusicId: match.appleMusicId, durationMs: match.durationMs || song.durationMs };
        }
      } catch {}
    }
    console.log("[NowPlaying] useThis — appleMusicId before:", nowPlayingSong.appleMusicId, "after:", song.appleMusicId);

    onChange(song);
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
        style={[styles.identifyButton, isShazaming && { borderColor: "#E8825C" }]}
        activeOpacity={0.7}
        onPress={handleIdentify}
      >
        {isShazaming ? (
          <View style={styles.identifyRow}>
            <ActivityIndicator size="small" color="#E8825C" style={{ marginRight: 8 }} />
            <Text style={[styles.identifyButtonText, { color: "#E8825C" }]}>
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

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    songCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.10)",
      padding: 12,
      borderRadius: 12,
    },
    artwork: {
      width: 64,
      height: 64,
      borderRadius: 8,
    },
    songInfo: {
      flex: 1,
      marginLeft: 12,
    },
    songTitle: {
      fontSize: 16,
      fontFamily: "DMSans_600SemiBold",
      color: "#fff",
    },
    songArtist: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.55)",
      marginTop: 2,
    },
    changeText: {
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.4)",
      marginLeft: 8,
    },
    selectSongButton: {
      backgroundColor: "#fff",
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    selectSongButtonText: {
      color: "#0F0D0B",
      fontSize: 17,
      fontFamily: "DMSans_600SemiBold",
    },
    identifyButton: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    identifyRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    identifyButtonText: {
      fontSize: 14,
      fontFamily: "DMSans_500Medium",
      color: "rgba(255,255,255,0.6)",
    },
    nowPlayingBanner: {
      backgroundColor: "rgba(20,15,12,0.7)",
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#E8825C",
    },
    shazamBanner: {
      marginTop: 12,
      backgroundColor: "rgba(20,15,12,0.7)",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: "#E8825C",
    },
    bannerContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    bannerArtwork: {
      width: 44,
      height: 44,
      borderRadius: 8,
    },
    bannerInfo: {
      flex: 1,
      marginLeft: 12,
    },
    bannerLabel: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      color: "#E8825C",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    shazamLabel: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      color: "#E8825C",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    bannerTitle: {
      fontSize: 14,
      fontFamily: "DMSans_600SemiBold",
      color: "#fff",
      marginTop: 1,
    },
    bannerArtist: {
      fontSize: 12,
      fontFamily: "DMSans_400Regular",
      color: "rgba(255,255,255,0.55)",
      marginTop: 1,
    },
    bannerDismiss: {
      padding: 4,
    },
    bannerDismissText: {
      fontSize: 12,
      color: "rgba(255,255,255,0.4)",
    },
    useButton: {
      marginTop: 10,
      backgroundColor: "#fff",
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: "center",
    },
    useButtonText: {
      fontSize: 14,
      fontFamily: "DMSans_600SemiBold",
      color: "#0F0D0B",
    },
    shazamError: {
      marginTop: 8,
      fontSize: 14,
      fontFamily: "DMSans_400Regular",
      color: "#FF453A",
      textAlign: "center",
    },
  });
}
