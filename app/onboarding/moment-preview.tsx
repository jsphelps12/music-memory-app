import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
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
import { mapRowToMoment } from "@/lib/moments";
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
  const [sharePromptVisible, setSharePromptVisible] = useState(false);
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
      .then(({ data }) => {
        if (data) setMoment(mapRowToMoment(data));
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

  // Show share prompt after a short delay
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => setSharePromptVisible(true), 2000);
    return () => clearTimeout(t);
  }, [moment]);

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
    setSharePromptVisible(false);
    try {
      await Share.share({
        message: `"${moment.songTitle}" by ${moment.songArtist}${moment.reflectionText ? ` — "${moment.reflectionText}"` : ""}`,
      });
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
        {moment.songArtworkUrl ? (
          <Image source={{ uri: moment.songArtworkUrl }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={[styles.artworkPlaceholder, { backgroundColor: theme.colors.accentBg }]}>
            <Ionicons name="musical-note" size={48} color={theme.colors.accent} />
          </View>
        )}

        <View style={styles.songRow}>
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
          style={[styles.continueButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueButtonText, { color: theme.colors.buttonText }]}>
            Continue →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Share prompt */}
      <Modal
        visible={sharePromptVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSharePromptVisible(false)}
      >
        <TouchableOpacity
          style={styles.shareOverlay}
          activeOpacity={1}
          onPress={() => setSharePromptVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.shareSheet, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <View style={styles.shareHandle} />
              <Text style={[styles.shareTitle, { color: theme.colors.text }]}>
                Share this moment?
              </Text>
              <Text style={[styles.shareBody, { color: theme.colors.textSecondary }]}>
                Know someone this song belongs to? Send them this memory.
              </Text>
              <TouchableOpacity
                style={[styles.shareButton, { backgroundColor: theme.colors.buttonBg }]}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={18} color={theme.colors.buttonText} />
                <Text style={[styles.shareButtonText, { color: theme.colors.buttonText }]}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareDismiss}
                onPress={() => setSharePromptVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.shareDismissText, { color: theme.colors.textSecondary }]}>
                  Maybe later
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    // Share prompt sheet
    shareOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    shareSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      alignItems: "center",
    },
    shareHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: 20,
    },
    shareTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      marginBottom: 8,
      textAlign: "center",
    },
    shareBody: {
      fontSize: theme.fontSize.base,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: theme.spacing["2xl"],
    },
    shareButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 52,
      borderRadius: theme.radii.button,
      paddingHorizontal: 32,
      alignSelf: "stretch",
      justifyContent: "center",
    },
    shareButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    shareDismiss: {
      paddingVertical: 14,
    },
    shareDismissText: {
      fontSize: theme.fontSize.sm,
    },
  });
}
