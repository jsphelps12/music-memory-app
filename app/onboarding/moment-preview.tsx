import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Share, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { useRouter, useLocalSearchParams } from "expo-router";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { getPublicPhotoUrl } from "@/lib/storage";
import { ensureShareToken, momentShareUrl } from "@/lib/momentShares";
import { friendlyError } from "@/lib/errors";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Moment } from "@/types";

type ScreenState = "loading" | "error" | "ready";

export default function OnboardingMomentPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const footerInset = { paddingBottom: insets.bottom + theme.spacing.lg };
  const { moment1Id, moment2Id } = useLocalSearchParams<{ moment1Id?: string; moment2Id?: string }>();

  const momentIdToShow = moment2Id || moment1Id || "";

  const [moment, setMoment] = useState<Moment | null>(null);
  const [state, setState] = useState<ScreenState>("loading");
  const [error, setError] = useState("");
  const [volumeBannerVisible, setVolumeBannerVisible] = useState(true);
  const soundRef = useRef<AudioPlayer | null>(null);

  // Redirect immediately if no moment to show
  useEffect(() => {
    if (!momentIdToShow) {
      router.replace({
        pathname: "/onboarding/celebration",
        params: { moment1Id: moment1Id ?? "", moment2Id: moment2Id ?? "" },
      } as any);
    }
  }, []);

  const goToCelebration = useCallback(() => {
    router.replace({
      pathname: "/onboarding/celebration",
      params: { moment1Id: moment1Id ?? "", moment2Id: moment2Id ?? "" },
    } as any);
  }, [router, moment1Id, moment2Id]);

  // Fetch moment data. Onboarding can't go back, so a failure offers Retry
  // and Continue; a missing row skips the preview, as no id does.
  const loadMoment = useCallback(async () => {
    if (!momentIdToShow) return;
    setState("loading");
    setError("");
    const { data, error: fetchError } = await supabase
      .from("moments")
      .select("*")
      .eq("id", momentIdToShow)
      .maybeSingle();
    if (fetchError) {
      setError(friendlyError(fetchError));
      setState("error");
      return;
    }
    if (!data) {
      goToCelebration();
      return;
    }
    setMoment(mapRowToMoment(data));
    setState("ready");
  }, [momentIdToShow, goToCelebration]);

  useEffect(() => {
    void loadMoment();
  }, [loadMoment]);

  // Play preview audio. createAudioPlayer is synchronous (expo-av's create
  // was a promise), so the old cancelled-flag dance is gone.
  useEffect(() => {
    if (!moment?.songPreviewUrl) return;

    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

    try {
      const player = createAudioPlayer({ uri: moment.songPreviewUrl });
      player.loop = true;
      player.volume = 1.0;
      player.play();
      soundRef.current = player;
    } catch {}

    return () => {
      try {
        soundRef.current?.pause();
        soundRef.current?.remove();
      } catch {}
      soundRef.current = null;
    };
  }, [moment?.songPreviewUrl]);

  const handleContinue = async () => {
    try {
      soundRef.current?.pause();
      soundRef.current?.remove();
    } catch {}
    soundRef.current = null;
    goToCelebration();
  };

  const handleShare = async () => {
    if (!moment) return;
    let token: string;
    try {
      // Throws if the token wasn't saved, so a link that leads nowhere is
      // never sent.
      token = await ensureShareToken(moment.id, moment.shareToken);
    } catch (err) {
      Alert.alert("Couldn't create link", friendlyError(err));
      return;
    }
    setMoment((prev) => (prev && prev.id === moment.id ? { ...prev, shareToken: token } : prev));
    try {
      const url = momentShareUrl(token);
      await Share.share({ message: url, url });
    } catch {
      // Share sheet dismissed or failed to present; the link exists.
    }
  };

  if (state === "error") {
    return (
      <View style={styles.container}>
        <ErrorState message={error} onRetry={loadMoment} />
        <View style={[styles.footer, footerInset]}>
          <Button label="Continue" variant="secondary" onPress={handleContinue} />
        </View>
      </View>
    );
  }

  if (state !== "ready" || !moment) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  }

  // Moods are words (DESIGN.md): date, moods, place and people as one Meta
  // line instead of a row of pills.
  const metaLine = [
    moment.momentDate
      ? new Date(moment.momentDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : null,
    ...moment.moods,
    moment.location || null,
    moment.people.length ? `With ${moment.people.slice(0, 2).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.container}>
      {/* Volume nudge */}
      {volumeBannerVisible ? (
        <View style={[styles.volumeBanner, { paddingTop: insets.top + theme.spacing.xs }]}>
          <Icon name="volume-high-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.volumeText}>Turn up your volume</Text>
          <IconButton
            name="close"
            size={18}
            color={theme.colors.textSecondary}
            onPress={() => setVolumeBannerVisible(false)}
            accessibilityLabel="Dismiss"
          />
        </View>
      ) : (
        <View style={{ height: insets.top + theme.spacing.md }} />
      )}

      {/* Moment card */}
      <View style={styles.card}>
        {moment.photoUrls?.[0] ? (
          <AppImage source={{ uri: getPublicPhotoUrl(moment.photoUrls[0]) }} style={styles.artwork} contentFit="cover" />
        ) : moment.songArtworkUrl ? (
          <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={styles.artworkPlaceholder}>
            <Icon name="musical-note" size={48} color={theme.colors.textSecondary} />
          </View>
        )}

        <View style={styles.songRow}>
          {moment.photoUrls?.[0] && moment.songArtworkUrl ? (
            <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.songArtwork} contentFit="cover" />
          ) : null}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>{moment.songTitle}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{moment.songArtist}</Text>
          </View>
          {moment.songPreviewUrl ? (
            // Playing state is the view's one terracotta signal.
            <View style={styles.playingBadge}>
              <Icon name="musical-notes" size={14} color={theme.colors.accent} />
              <Text style={styles.playingText}>Playing</Text>
            </View>
          ) : null}
        </View>

        {Boolean(moment.reflectionText) && (
          <Text style={styles.reflection} numberOfLines={6}>
            {moment.reflectionText}
          </Text>
        )}

        {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
      </View>

      <View style={[styles.footer, footerInset]}>
        <Button label="Share this moment" icon="share-outline" variant="secondary" onPress={handleShare} />
        <Button label="Continue" onPress={handleContinue} />
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
      gap: theme.spacing.sm,
      paddingLeft: theme.spacing.xl,
      paddingRight: theme.spacing.sm,
    },
    volumeText: {
      ...theme.typography.callout,
      fontSize: theme.fontSize.sm,
      flex: 1,
      color: theme.colors.textSecondary,
    },
    card: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
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
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    songArtwork: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.sm,
    },
    songInfo: {
      flex: 1,
    },
    songTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
      marginBottom: 2,
    },
    songArtist: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
    },
    playingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    playingText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    reflection: {
      ...theme.typography.reading,
      color: theme.colors.text,
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.sm + 2,
    },
  });
}
