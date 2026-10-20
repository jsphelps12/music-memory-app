import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { getPublicPhotoUrl, momentCardImageUrls } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import {
  markShareTokenOpened,
  openSharedMoment,
  SharedMomentView,
} from "@/lib/sharedMomentLink";

type ScreenState = "loading" | "not_found" | "error" | "ready";

/**
 * A /m/{token} share link opened in the app. Expo Router routes the universal
 * link here; hooks/useDeepLinkHandler.ts brings parked links here after sign-in.
 *
 * The owner is sent on to their normal detail screen. Anyone else sees a
 * read-only view of what the link shares (no edit, delete or share), with an
 * offer to add the sender as a friend. Nothing is saved for the viewer: when
 * the owner turns the link off, this stops working.
 */
export default function SharedMomentLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const { currentSong, isPlaying, playError, playFull, pause } = usePlayer();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<ScreenState>("loading");
  const [error, setError] = useState("");
  const [moment, setMoment] = useState<SharedMomentView | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  // Guards against a late response landing after a retry or unmount.
  const requestRef = useRef(0);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as any);
  }, [router]);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    const request = ++requestRef.current;
    markShareTokenOpened(token);
    setState("loading");
    setError("");
    try {
      const result = await openSharedMoment(token);
      if (request !== requestRef.current) return;
      if (result.kind === "not_found") {
        setState("not_found");
      } else if (result.kind === "detail") {
        router.replace({ pathname: "/moment/[id]" as any, params: { id: result.id } });
      } else {
        setMoment(result.moment);
        setState("ready");
      }
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(friendlyError(e));
      setState("error");
    }
  }, [token, userId, router]);

  useEffect(() => {
    void load();
    const requests = requestRef;
    return () => {
      requests.current++;
    };
  }, [load]);

  const photoUrls = useMemo(() => (moment?.photoUrls ?? []).map(getPublicPhotoUrl), [moment?.photoUrls]);
  const stripUrls = useMemo(() => (moment ? momentCardImageUrls(moment) : []), [moment]);

  const moodLabels = useMemo(() => {
    if (!moment) return [];
    // The sender's custom moods aren't readable here, so only built-in moods
    // get a label; their custom ones are left out rather than shown as ids.
    return moment.moods
      .map((value) => MOODS.find((m) => m.value === value)?.label)
      .filter((label): label is string => !!label);
  }, [moment]);

  const senderName = moment?.senderName ?? "A friend";
  const isCurrentSong =
    isPlaying && !!moment?.songAppleMusicId && currentSong?.appleMusicId === moment.songAppleMusicId;
  const canPlay = !!moment?.songAppleMusicId || !!moment?.songPreviewUrl;

  const handlePlay = () => {
    if (!moment) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrentSong) {
      pause();
      return;
    }
    void playFull(
      {
        id: moment.songAppleMusicId ?? moment.id,
        title: moment.songTitle,
        artistName: moment.songArtist,
        albumName: moment.songAlbumName ?? "",
        artworkUrl: moment.songArtworkUrl ?? "",
        provider: "apple_music",
        appleMusicId: moment.songAppleMusicId,
        spotifyId: null,
        durationMs: 0,
      },
      moment.songPreviewUrl ?? undefined
    );
  };

  const formatWhen = (dateStr: string | null, location: string | null) => {
    const parts: string[] = [];
    if (dateStr) {
      parts.push(
        new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
    }
    if (location) parts.push(location);
    return parts.join(" · ");
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <IconButton name="chevron-back" onPress={close} accessibilityLabel="Back" />
    </View>
  );

  if (state === "loading") {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      </View>
    );
  }

  if (state !== "ready" || !moment) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        {state === "error" ? (
          <ErrorState message={error} onRetry={load} onBack={close} />
        ) : (
          <ErrorState message="This link doesn't work anymore. It may have been turned off." onBack={close} />
        )}
      </View>
    );
  }

  const heroUrl = photoUrls[0] ?? moment.songArtworkUrl;
  const when = formatWhen(moment.momentDate, moment.location);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["4xl"] }]}>
        <View style={styles.senderRow}>
          <View style={styles.senderAvatar}>
            {moment.senderAvatarUrl ? (
              <AppImage
                source={{ uri: getPublicPhotoUrl(moment.senderAvatarUrl) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.senderInitial}>{senderName[0]?.toUpperCase() ?? "?"}</Text>
            )}
          </View>
          <Text style={styles.senderText} numberOfLines={1}>
            From {senderName}
          </Text>
        </View>

        {heroUrl ? (
          <TouchableOpacity
            activeOpacity={0.95}
            disabled={photoUrls.length === 0}
            onPress={() => { setViewerIndex(0); setViewerVisible(true); }}
            accessibilityRole={photoUrls.length > 0 ? "imagebutton" : "image"}
            accessibilityLabel={photoUrls.length > 0 ? "Open photos" : `${moment.songTitle} artwork`}
          >
            <AppImage source={{ uri: heroUrl }} style={styles.hero} contentFit="cover" />
          </TouchableOpacity>
        ) : (
          <ArtworkPlaceholder style={styles.hero} />
        )}

        <Text style={styles.songTitle} numberOfLines={2}>{moment.songTitle}</Text>
        <Text style={styles.artistLine} numberOfLines={2}>
          {[moment.songArtist, moment.songAlbumName].filter(Boolean).join(" · ")}
        </Text>
        {when ? <Text style={styles.whenLine}>{when}</Text> : null}

        {canPlay ? (
          <TouchableOpacity
            style={styles.playRow}
            onPress={handlePlay}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isCurrentSong ? "Pause" : "Play"}
          >
            <View style={[styles.playButton, playError && !isCurrentSong && styles.playButtonError]}>
              <Ionicons
                name={isCurrentSong ? "pause" : "play"}
                size={18}
                color={playError && !isCurrentSong ? theme.colors.textTertiary : theme.colors.buttonText}
              />
            </View>
            <Text style={styles.playHint}>{isCurrentSong ? "Playing" : "Play"}</Text>
          </TouchableOpacity>
        ) : null}

        {moment.reflectionText ? (
          <View style={styles.reflectionBlock}>
            {moment.reflectionText
              .split(/\n\s*\n/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <Text key={i} style={styles.reflection} selectable>{para}</Text>
              ))}
          </View>
        ) : null}

        {moodLabels.length > 0 ? (
          <Text style={styles.moodWords}>{moodLabels.join(" · ").toUpperCase()}</Text>
        ) : null}

        {stripUrls.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoStrip}
            contentContainerStyle={styles.photoStripContent}
          >
            {stripUrls.map((url, idx) => (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.85}
                onPress={() => { setViewerIndex(idx); setViewerVisible(true); }}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo ${idx + 1} of ${stripUrls.length}`}
              >
                <AppImage source={{ uri: url }} style={styles.photoStripThumb} contentFit="cover" transition={200} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {moment.senderFriendToken ? (
          <TouchableOpacity
            style={styles.friendButton}
            activeOpacity={0.8}
            onPress={() =>
              router.push({ pathname: "/friend/[token]" as any, params: { token: moment.senderFriendToken! } })
            }
          >
            <Ionicons name="person-add-outline" size={16} color={theme.colors.buttonText} />
            <Text style={styles.friendButtonText} numberOfLines={1}>
              Add {senderName} as a friend
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <PhotoViewer
        photos={photoUrls}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
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
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      paddingHorizontal: theme.spacing["2xl"],
    },
    senderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    senderAvatar: {
      width: 28,
      height: 28,
      borderRadius: theme.radii.full,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.backgroundTertiary,
    },
    senderInitial: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textTertiary,
    },
    senderText: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    hero: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.md,
    },
    songTitle: {
      fontFamily: theme.fonts.display,
      fontSize: theme.fontSize["2xl"],
      color: theme.colors.text,
      marginTop: theme.spacing.xl,
    },
    artistLine: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
    whenLine: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    playRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
      alignSelf: "flex-start",
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    playButtonError: {
      backgroundColor: theme.colors.chipBg,
    },
    playHint: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    reflectionBlock: {
      marginTop: theme.spacing["2xl"],
      gap: theme.spacing.md,
    },
    reflection: {
      fontFamily: theme.fonts.reading,
      fontSize: theme.fontSize.lg,
      lineHeight: 28,
      color: theme.colors.text,
    },
    moodWords: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 1,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing.xl,
    },
    photoStrip: {
      marginTop: theme.spacing.xl,
      marginHorizontal: -theme.spacing["2xl"],
    },
    photoStripContent: {
      paddingHorizontal: theme.spacing["2xl"],
      gap: theme.spacing.sm,
    },
    photoStripThumb: {
      width: 96,
      height: 96,
      borderRadius: theme.radii.sm,
    },
    friendButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing["3xl"],
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.button,
      backgroundColor: theme.colors.buttonBg,
    },
    friendButtonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.buttonText,
    },
  });
}
