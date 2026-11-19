import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeIn, ReduceMotion } from "react-native-reanimated";
import { usePostHog } from "posthog-react-native";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { getTheme, Theme } from "@/constants/theme";
import { ThemeScheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { consumeCachedMoment, setCachedMoment } from "@/lib/momentCache";
import { artworkUrlAtSize } from "@/lib/itunes";
import { friendlyError } from "@/lib/errors";
import { playAction } from "@/lib/playerAction";
import { anniversaryLabel, fullDateLabel } from "@/lib/memoryCard";
import { excerpt } from "@/lib/yearInReview";
import type { MomentCardData } from "@/types";

const STALE_TIME = 2 * 60 * 1000;
const night = getTheme("dark");

async function fetchMemory(id: string): Promise<MomentCardData | null> {
  const { data, error } = await supabase.from("moments").select(MOMENT_CARD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapRowToMoment(data) : null;
}

/**
 * The memory card: On this day that plays. Opened by the On this day push
 * (data.type "memory") and from Rediscover's On this day. Full screen on
 * night, the song already playing, the anniversary, and your words. "Open
 * the moment" goes on to the full entry with the song still playing.
 */
export default function MemoryCardRoute() {
  return (
    <ThemeScheme scheme="dark">
      <MemoryCard />
    </ThemeScheme>
  );
}

function MemoryCard() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const posthog = usePostHog();
  const styles = useMemo(() => createStyles(night), []);
  const { currentSong, isPlaying, playError, playFull, pause, resume, stop } = usePlayerControls();

  // A tap from Rediscover hands over the card data, so it paints at once.
  const [handed] = useState(() => {
    const c = consumeCachedMoment();
    return c && c.id === id ? c : null;
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["memoryCard", user?.id, id],
    queryFn: () => fetchMemory(id!),
    enabled: !!user && !!id,
    staleTime: STALE_TIME,
    initialData: handed ?? undefined,
  });
  const moment = data ?? null;

  const songId = moment?.songSpotifyId ?? moment?.songAppleMusicId ?? null;
  const loadedId = currentSong?.spotifyId ?? currentSong?.appleMusicId ?? null;
  const action = playAction(songId, loadedId, isPlaying);

  const play = useCallback(() => {
    if (!moment || !songId) return;
    void playFull(
      {
        id: songId,
        title: moment.songTitle,
        artistName: moment.songArtist,
        albumName: moment.songAlbumName ?? "",
        artworkUrl: moment.songArtworkUrl,
        provider: moment.songProvider ?? "apple_music",
        appleMusicId: moment.songAppleMusicId ?? null,
        spotifyId: moment.songSpotifyId ?? null,
        durationMs: 0,
      },
      moment.songPreviewUrl || undefined
    );
  }, [moment, songId, playFull]);

  // The song starts as the card appears: that's the point of it.
  const started = useRef(false);
  useEffect(() => {
    if (!moment || started.current) return;
    started.current = true;
    posthog?.capture("memory_card_opened", { source: source ?? "unknown", has_words: !!moment.reflectionText.trim() });
    if (action === "pause") return; // already playing this song
    if (action === "resume") resume();
    else play();
  }, [moment, action, play, resume, posthog, source]);

  // Going on to the moment keeps the song; closing the card stops it.
  const goingOn = useRef(false);
  useEffect(
    () => () => {
      if (!goingOn.current) void stop();
    },
    [stop]
  );

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const openMoment = useCallback(() => {
    if (!moment) return;
    goingOn.current = true;
    posthog?.capture("memory_card_open_moment");
    setCachedMoment(moment);
    router.replace({ pathname: "/moment/[id]", params: { id: moment.id } });
  }, [moment, router, posthog]);

  const topBar = (
    <View style={[styles.topBar, { paddingTop: insets.top + night.spacing.xs }]}>
      <IconButton name="close" onPress={close} color={night.colors.text} accessibilityLabel="Close" />
    </View>
  );

  // A fullScreenModal with no swipe to dismiss: the ✕ shows while loading too.
  if (isLoading && !moment) {
    return (
      <View style={styles.screen}>
        {topBar}
        <View style={styles.centered}>
          <ActivityIndicator color={night.colors.textSecondary} />
        </View>
      </View>
    );
  }
  if (error && !moment) {
    return (
      <View style={styles.screen}>
        {topBar}
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />
      </View>
    );
  }
  if (!moment) {
    return (
      <View style={styles.screen}>
        {topBar}
        <ErrorState message="This moment isn't here any more." />
      </View>
    );
  }

  const art = Math.min(width - 2 * night.spacing["2xl"], 340);
  const label = anniversaryLabel(moment.momentDate, new Date());
  const words = moment.reflectionText.trim() ? excerpt(moment.reflectionText, 320) : null;
  const playLabel = action === "pause" ? "Pause" : playError ? "Unavailable" : "Play";
  const fade = (delay: number) => FadeIn.duration(600).delay(delay).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);

  return (
    <View style={styles.screen}>
      {moment.songArtworkUrl ? (
        <AppImage
          source={{ uri: artworkUrlAtSize(moment.songArtworkUrl, 300) }}
          style={StyleSheet.absoluteFill}
          blurRadius={60}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.dim} />
      {topBar}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + night.spacing["2xl"] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={fade(0)}>
          <AppImage
            source={{ uri: artworkUrlAtSize(moment.songArtworkUrl, 600) }}
            style={[styles.art, { width: art, height: art }]}
            accessibilityLabel={`${moment.songTitle} artwork`}
          />
        </Animated.View>

        <Animated.View entering={fade(250)} style={styles.text}>
          {label ? (
            <Text style={styles.headline} accessibilityRole="header">
              {label}
            </Text>
          ) : null}
          {words ? <Text style={styles.words}>{`“${words}”`}</Text> : null}
        </Animated.View>

        <Animated.View entering={fade(500)} style={styles.player}>
          <IconButton
            name={action === "pause" ? "pause" : "play"}
            onPress={() => (action === "pause" ? pause() : action === "resume" ? resume() : play())}
            variant="glass"
            accessibilityLabel={playLabel}
          />
          <View style={styles.song}>
            <Text style={styles.songTitle} numberOfLines={1}>
              {moment.songTitle}
            </Text>
            <Text style={styles.songMeta} numberOfLines={1}>
              {[moment.songArtist, fullDateLabel(moment.momentDate)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={fade(700)} style={styles.actions}>
          <Button label="Open the moment" onPress={openMoment} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(14,11,10,0.72)",
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.xl,
      // The ✕ glyph sits optically at the gutter, not its 44pt box.
      marginLeft: -12,
      zIndex: 2,
    },
    content: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingHorizontal: theme.spacing["2xl"],
      gap: theme.spacing.xl,
    },
    art: {
      borderRadius: theme.radii.sm,
    },
    text: {
      gap: theme.spacing.md,
    },
    headline: {
      ...theme.typography.headline,
      color: theme.colors.text,
    },
    words: {
      fontFamily: theme.fonts.reading,
      fontSize: 22,
      lineHeight: 32,
      color: theme.colors.text,
    },
    player: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    song: {
      flex: 1,
      gap: 2,
    },
    songTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    songMeta: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    actions: {
      marginTop: theme.spacing.sm,
    },
  });
}
