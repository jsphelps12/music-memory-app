import type { ComponentRef } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { usePostHog } from "posthog-react-native";
import { getTheme, Theme } from "@/constants/theme";
import { ThemeScheme } from "@/hooks/useTheme";
import { MOODS } from "@/constants/Moods";
import { moodLabel } from "@/lib/moodLabels";
import { artworkUrlAtSize } from "@/lib/itunes";
import { friendlyError } from "@/lib/errors";
import { buildYearReview, monthName, timesWord, type Chapter, type ReviewMoment } from "@/lib/yearInReview";
import { fetchYearReviewMoments } from "@/lib/yearReviewData";

const STALE_TIME = 2 * 60 * 1000;

// The story is always night, whatever the app's theme: it's a dark room with
// the artwork as the light (DESIGN.md, night as the second material).
const night = getTheme("dark");

function dateLabel(m: ReviewMoment): string {
  const iso = (m.momentDate ?? m.createdAt).slice(0, 10);
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function songOf(m: ReviewMoment) {
  return {
    id: m.songSpotifyId ?? m.songAppleMusicId ?? "",
    title: m.songTitle,
    artistName: m.songArtist,
    albumName: m.songAlbumName ?? "",
    artworkUrl: m.songArtworkUrl,
    provider: (m.songProvider ?? "apple_music") as "apple_music" | "spotify",
    appleMusicId: m.songAppleMusicId ?? null,
    spotifyId: m.songSpotifyId ?? null,
    durationMs: 0,
  };
}

/**
 * Year in review: a tap-through story of one year, each card playing its
 * song (lib/yearInReview.ts decides the cards). Tap the right side for the
 * next card, the left for the previous one. Presented full screen with a
 * close, since it's an experience you enter and leave.
 */
export default function YearInReviewRoute() {
  return (
    <ThemeScheme scheme="dark">
      <YearInReviewScreen />
    </ThemeScheme>
  );
}

function YearInReviewScreen() {
  const params = useLocalSearchParams<{ year: string }>();
  const year = Number(params.year);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, profile } = useAuth();
  const posthog = usePostHog();
  const { playPreview, stop } = usePlayerControls();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(night), []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["yearReview", user?.id, year],
    queryFn: () => fetchYearReviewMoments(user!.id, year),
    staleTime: STALE_TIME,
    enabled: !!user && Number.isFinite(year),
  });

  const review = useMemo(() => (data ? buildYearReview(data, year) : null), [data, year]);
  const chapters = review?.chapters ?? [];
  const [index, setIndex] = useState(0);
  const chapter: Chapter | undefined = chapters[index];

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);
  const moodText = useCallback(
    (value: string) => (moodLabel(value, allMoods) ?? value).toLowerCase(),
    [allMoods]
  );

  // Cross-fade between cards.
  const opacity = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [index, opacity, reduceMotion]);

  // Each card plays its own song; the story's audio stops when it closes.
  useEffect(() => {
    const m = chapter?.moment;
    if (m?.songPreviewUrl) void playPreview(songOf(m), m.songPreviewUrl);
  }, [chapter?.moment, playPreview]);
  useEffect(() => () => void stop(), [stop]);

  const opened = useRef(false);
  useEffect(() => {
    if (review && !opened.current) {
      opened.current = true;
      posthog?.capture("year_review_opened", { year, moments: review.total, cards: review.chapters.length });
    }
  }, [review, year, posthog]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= chapters.length) return;
      Haptics.selectionAsync();
      setIndex(next);
      if (next === chapters.length - 1) posthog?.capture("year_review_finished", { year });
    },
    [index, chapters.length, posthog, year]
  );

  const shotRef = useRef<ComponentRef<typeof ViewShot>>(null);
  const [sharing, setSharing] = useState(false);
  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await (shotRef.current as any).capture({ format: "png", quality: 1, result: "tmpfile" });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: `My ${year} in songs`, UTI: "public.png" });
      posthog?.capture("year_review_shared", { year });
    } catch {
      // Cancelled or capture failed: nothing to say.
    } finally {
      setSharing(false);
    }
  }, [sharing, year, posthog]);

  // The story is a fullScreenModal (no swipe to dismiss), so every state,
  // loading included, keeps its ✕ on the left.
  const closeButton = (
    <IconButton name="close" onPress={close} color={night.colors.text} accessibilityLabel="Close" />
  );

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={[styles.topBar, styles.topBarPadded]}>{closeButton}</View>
        <View style={styles.centeredFill}>
          <ActivityIndicator color={night.colors.textSecondary} />
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={[styles.topBar, styles.topBarPadded]}>{closeButton}</View>
        <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />
      </View>
    );
  }
  if (!review || !chapter) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={[styles.topBar, styles.topBarPadded]}>{closeButton}</View>
        <View style={styles.thin}>
          <Text style={styles.headline}>{`Your ${year} is still being written.`}</Text>
          <Text style={styles.meta}>
            A year in review needs five moments from that year. Keep saving the songs that matter.
          </Text>
        </View>
      </View>
    );
  }

  const art = Math.min(width - 2 * night.spacing["2xl"], 360);
  const backdrop = artworkUrlAtSize(chapter.moment.songArtworkUrl, 300);
  const isLast = index === chapters.length - 1;

  // Room at the bottom for what sits over the card: the hint, or the share
  // and done buttons on the last card.
  const footer = isLast ? 132 : 56;

  return (
    <View style={styles.screen}>
      {/* The whole frame is the share image: backdrop, night and the card. */}
      <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }} style={StyleSheet.absoluteFill}>
        <View style={styles.frame}>
          {/* The card's artwork, blurred, is the room's only color. */}
          {backdrop ? (
            <AppImage source={{ uri: backdrop }} style={StyleSheet.absoluteFill} blurRadius={60} contentFit="cover" />
          ) : null}
          <View style={styles.dim} />
          <Animated.View
            style={[styles.card, { paddingBottom: insets.bottom + night.spacing["2xl"] + footer }, fadeStyle]}
          >
            <ChapterBody chapter={chapter} year={year} art={art} moodText={moodText} styles={styles} />
          </Animated.View>
        </View>
      </ViewShot>

      <View style={[styles.topArea, { paddingTop: insets.top + night.spacing.sm }]}>
        <View style={styles.progress} accessibilityLabel={`Card ${index + 1} of ${chapters.length}`}>
          {chapters.map((c, i) => (
            <View key={`${c.kind}-${i}`} style={[styles.segment, i <= index && styles.segmentDone]} />
          ))}
        </View>
        <View style={styles.topBar}>
          {closeButton}
          <Text style={styles.yearMark}>{`${year} in songs`}</Text>
        </View>
      </View>

      {/* Tap zones: left third back, the rest forward. */}
      <Pressable style={styles.tapBack} onPress={() => go(-1)} accessibilityLabel="Previous" accessibilityRole="button" />
      <Pressable
        style={styles.tapNext}
        onPress={() => go(1)}
        disabled={isLast}
        accessibilityLabel="Next"
        accessibilityRole="button"
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + night.spacing.lg }]} pointerEvents="box-none">
        {isLast ? (
          <>
            <Button label="Share my year" icon="share-outline" onPress={share} loading={sharing} />
            <Button label="Done" variant="text" onPress={close} fullWidth style={styles.doneButton} />
          </>
        ) : index === 0 ? (
          <Text style={styles.hint} pointerEvents="none">Tap to continue</Text>
        ) : null}
      </View>
    </View>
  );
}

/** The closing mosaic as full rows: 2, 3, 4 or 6 across, trimmed to fit. */
function evenGrid(urls: string[]): { urls: string[]; columns: number } {
  const n = urls.length;
  const columns = n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 6;
  const full = n < columns ? n : n - (n % columns);
  return { urls: urls.slice(0, full), columns };
}

function Mosaic({ urls, size, columns, styles }: { urls: string[]; size: number; columns: number; styles: Styles }) {
  const gap = 4;
  const tile = Math.floor((size - gap * (columns - 1)) / columns);
  return (
    <View style={[styles.mosaic, { width: size, gap }]}>
      {urls.map((u) => (
        <AppImage key={u} source={{ uri: artworkUrlAtSize(u, 200) }} style={[styles.tile, { width: tile, height: tile }]} />
      ))}
    </View>
  );
}

function SongLine({ m, styles }: { m: ReviewMoment; styles: Styles }) {
  return (
    <Text style={styles.song} numberOfLines={1}>
      <Text style={styles.songTitle}>{m.songTitle}</Text>
      <Text style={styles.songArtist}>{`  ${m.songArtist}`}</Text>
    </Text>
  );
}

function ChapterBody({
  chapter,
  year,
  art,
  moodText,
  styles,
}: {
  chapter: Chapter;
  year: number;
  art: number;
  moodText: (v: string) => string;
  styles: Styles;
}) {
  const m = chapter.moment;
  const cover = (
    <AppImage source={{ uri: artworkUrlAtSize(m.songArtworkUrl, 600) }} style={[styles.art, { width: art, height: art }]} />
  );

  switch (chapter.kind) {
    case "cover":
      return (
        <View style={styles.body}>
          <Mosaic urls={chapter.artwork} size={art} columns={3} styles={styles} />
          <Text style={styles.display}>{`Your ${year} in songs`}</Text>
          <Text style={styles.meta}>
            {`${chapter.total} moments · ${chapter.songCount} ${chapter.songCount === 1 ? "song" : "songs"}`}
          </Text>
          <Text style={styles.lead}>{`It started on ${dateLabel(m)} with`}</Text>
          <SongLine m={m} styles={styles} />
        </View>
      );
    case "month":
      return (
        <View style={styles.body}>
          {chapter.artwork.length >= 4 ? <Mosaic urls={chapter.artwork} size={art} columns={2} styles={styles} /> : cover}
          <Text style={styles.headline}>{`${monthName(chapter.monthKey)} was your loudest month.`}</Text>
          <Text style={styles.meta}>{`${chapter.count} moments`}</Text>
          <SongLine m={m} styles={styles} />
        </View>
      );
    case "mood": {
      const rest = chapter.others.map(moodText);
      return (
        <View style={styles.body}>
          {cover}
          <Text style={styles.headline}>{`Mostly ${moodText(chapter.mood)}.`}</Text>
          <Text style={styles.meta}>
            {`${chapter.count} moments${rest.length ? `, then ${rest.join(" and ")}` : ""}`}
          </Text>
          <SongLine m={m} styles={styles} />
        </View>
      );
    }
    case "person":
      return (
        <View style={styles.body}>
          {cover}
          <Text style={styles.headline}>{`${chapter.person} was there ${timesWord(chapter.count)}.`}</Text>
          <Text style={styles.meta}>{dateLabel(m)}</Text>
          <SongLine m={m} styles={styles} />
        </View>
      );
    case "place":
      return (
        <View style={styles.body}>
          {cover}
          <Text style={styles.headline}>{`${chapter.place}, ${timesWord(chapter.count)}.`}</Text>
          <Text style={styles.meta}>{dateLabel(m)}</Text>
          <SongLine m={m} styles={styles} />
        </View>
      );
    case "words":
      return (
        <View style={styles.body}>
          <Text style={styles.kicker}>The one you wrote the most about</Text>
          <Text style={styles.quote}>{`“${chapter.excerpt}”`}</Text>
          <View style={styles.wordsSong}>
            <AppImage source={{ uri: artworkUrlAtSize(m.songArtworkUrl, 120) }} style={styles.thumb} />
            <View style={styles.wordsSongText}>
              <SongLine m={m} styles={styles} />
              <Text style={styles.meta}>{dateLabel(m)}</Text>
            </View>
          </View>
        </View>
      );
    case "closing":
      return (
        <View style={styles.body}>
          <Mosaic urls={evenGrid(chapter.artwork).urls} size={art} columns={evenGrid(chapter.artwork).columns} styles={styles} />
          <Text style={styles.headline}>{`And it ended on ${dateLabel(m)} with`}</Text>
          <SongLine m={m} styles={styles} />
          <Text style={styles.meta}>{`${chapter.total} moments, one year.`}</Text>
          <Text style={styles.wordmark}>Soundtracks</Text>
        </View>
      );
  }
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    // Night over the blurred artwork so text holds contrast on any cover.
    dim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(14,11,10,0.72)",
    },
    topArea: {
      paddingHorizontal: theme.spacing.xl,
      zIndex: 3,
    },
    progress: {
      flexDirection: "row",
      gap: 4,
    },
    segment: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: "rgba(245,240,235,0.22)",
    },
    segmentDone: {
      backgroundColor: theme.colors.text,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      // The ✕ glyph sits optically at the gutter, not its 44pt box.
      marginLeft: -12,
    },
    // The bar outside the story's topArea, which carries the gutter itself.
    topBarPadded: {
      paddingHorizontal: theme.spacing.xl,
    },
    centeredFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    yearMark: {
      ...theme.typography.label,
      color: theme.colors.textSecondary,
    },
    tapBack: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "33%",
      zIndex: 1,
    },
    tapNext: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: "67%",
      zIndex: 1,
    },
    card: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: theme.spacing["2xl"],
      zIndex: 2,
    },
    frame: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    body: {
      gap: theme.spacing.md,
    },
    art: {
      borderRadius: theme.radii.sm,
      marginBottom: theme.spacing.lg,
    },
    mosaic: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: theme.spacing.lg,
    },
    tile: {
      borderRadius: 4,
    },
    display: {
      fontFamily: theme.fonts.display,
      fontSize: 44,
      lineHeight: 48,
      letterSpacing: -0.5,
      color: theme.colors.text,
    },
    headline: {
      ...theme.typography.headline,
      color: theme.colors.text,
    },
    kicker: {
      ...theme.typography.label,
      color: theme.colors.textSecondary,
    },
    lead: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    meta: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
    },
    song: {
      ...theme.typography.body,
    },
    songTitle: {
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    quote: {
      fontFamily: theme.fonts.reading,
      fontSize: 24,
      lineHeight: 34,
      color: theme.colors.text,
    },
    wordsSong: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    wordsSongText: {
      flex: 1,
      gap: 2,
    },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.sm,
    },
    wordmark: {
      fontFamily: theme.fonts.display,
      fontSize: theme.fontSize.lg,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.lg,
    },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: theme.spacing["2xl"],
      gap: theme.spacing.xs,
      zIndex: 4,
    },
    doneButton: {
      alignSelf: "stretch",
    },
    hint: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
      textAlign: "center",
      paddingVertical: theme.spacing.md,
    },
    thin: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2xl"],
      gap: theme.spacing.md,
    },
  });
}
