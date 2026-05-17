import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Share,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Audio } from "expo-av";
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";
import { mapRowToMoment } from "@/lib/moments";
import { getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Moment } from "@/types";

export default function OnboardingMomentPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { moment1Id, moment2Id } = useLocalSearchParams<{ moment1Id?: string; moment2Id?: string }>();

  const momentIdToShow = moment2Id || moment1Id || "";

  const [moment, setMoment] = useState<Moment | null>(null);
  const [loading, setLoading] = useState(true);
  const [volumeBannerVisible, setVolumeBannerVisible] = useState(true);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Redirect immediately if no moment to show
  useEffect(() => {
    if (!momentIdToShow) {
      router.replace({
        pathname: "/onboarding/celebration",
        params: { moment1Id: moment1Id ?? "", moment2Id: moment2Id ?? "" },
      } as any);
    }
  }, []);

  // Fetch moment data
  useEffect(() => {
    if (!momentIdToShow) return;
    supabase
      .from("moments")
      .select("*")
      .eq("id", momentIdToShow)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setMoment(mapRowToMoment(data));
        setLoading(false);
      });
  }, [momentIdToShow]);

  // Play preview audio
  useEffect(() => {
    if (!moment?.songPreviewUrl) return;
    let cancelled = false;

    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});

    Audio.Sound.createAsync(
      { uri: moment.songPreviewUrl },
      { shouldPlay: true, isLooping: true, volume: 1.0 }
    ).then(({ sound }) => {
      if (cancelled) {
        sound.unloadAsync();
        return;
      }
      soundRef.current = sound;
    }).catch(() => {});

    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [moment?.songPreviewUrl]);

  const handleContinue = async () => {
    await soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    router.replace({
      pathname: "/onboarding/celebration",
      params: { moment1Id: moment1Id ?? "", moment2Id: moment2Id ?? "" },
    } as any);
  };

  const handleShare = async () => {
    if (!moment) return;
    try {
      let token = moment.shareToken;
      if (!token) {
        token = Crypto.randomUUID();
        await supabase.from("moments").update({ share_token: token }).eq("id", moment.id);
      }
      const url = `https://soundtracks.app/m/${token}`;
      await Share.share({ message: url, url });
    } catch {}
  };

  if (loading || !moment) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Volume nudge */}
      {volumeBannerVisible && (
        <View style={styles.volumeBanner}>
          <Ionicons name="volume-high-outline" size={16} color={theme.colors.accent} />
          <Text style={styles.volumeText}>Turn up your volume</Text>
          <TouchableOpacity onPress={() => setVolumeBannerVisible(false)} hitSlop={10}>
            <Text style={styles.volumeDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Moment card */}
      <View style={styles.card}>
        {moment.photoUrls?.[0] ? (
          <Image source={{ uri: getPublicPhotoUrl(moment.photoUrls[0]) }} style={styles.artwork} contentFit="cover" />
        ) : moment.songArtworkUrl ? (
          <Image source={{ uri: moment.songArtworkUrl }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={[styles.artworkPlaceholder, { backgroundColor: theme.colors.accentBg }]}>
            <Ionicons name="musical-note" size={48} color={theme.colors.accent} />
          </View>
        )}

        <View style={styles.songRow}>
          {moment.photoUrls?.[0] && moment.songArtworkUrl ? (
            <Image source={{ uri: moment.songArtworkUrl }} style={styles.songArtwork} contentFit="cover" />
          ) : null}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>{moment.songTitle}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{moment.songArtist}</Text>
          </View>
          {moment.songPreviewUrl ? (
            <View style={styles.playingBadge}>
              <Ionicons name="musical-notes" size={12} color={theme.colors.accent} />
              <Text style={styles.playingText}>Playing</Text>
            </View>
          ) : null}
        </View>

        {Boolean(moment.reflectionText) && (
          <Text style={styles.reflection} numberOfLines={6}>
            {moment.reflectionText}
          </Text>
        )}

        <View style={styles.chips}>
          {moment.momentDate && (
            <View style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>
                {new Date(moment.momentDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </Text>
            </View>
          )}
          {moment.mood && (
            <View style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>{moment.mood}</Text>
            </View>
          )}
          {moment.location && (
            <View style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Ionicons name="location-outline" size={11} color={theme.colors.textSecondary} />
              <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>{moment.location}</Text>
            </View>
          )}
          {moment.people.slice(0, 2).map((p) => (
            <View key={p} style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>@ {p}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.shareButton, { backgroundColor: theme.colors.accentBg }]}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
          <Text style={[styles.shareButtonText, { color: theme.colors.accent }]}>Share this moment</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.buttonText }]}>
            Continue →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      alignItems: "center",
      justifyContent: "center",
    },
    volumeBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: Platform.OS === "ios" ? 60 : 20,
      paddingBottom: 12,
    },
    volumeText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    volumeDismiss: {
      fontSize: 12,
      color: theme.colors.textTertiary,
    },
    card: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      gap: theme.spacing.lg,
    },
    artwork: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.md,
    },
    artworkPlaceholder: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.md,
      alignItems: "center",
      justifyContent: "center",
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    songArtwork: {
      width: 44,
      height: 44,
      borderRadius: 6,
    },
    songInfo: {
      flex: 1,
    },
    songTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: 2,
    },
    songArtist: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
    },
    playingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      backgroundColor: theme.colors.accentBg,
    },
    playingText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.semibold,
    },
    reflection: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      lineHeight: 24,
      fontStyle: "italic",
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    chipText: {
      fontSize: theme.fontSize.sm,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      paddingTop: 12,
      gap: 10,
    },
    shareButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 52,
      borderRadius: theme.radii.button,
    },
    shareButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    continueButton: {
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
    },
    continueButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
  });
}
