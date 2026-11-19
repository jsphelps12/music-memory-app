import { useEffect, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";

/* eslint-disable @typescript-eslint/no-require-imports */
const HERO_PHOTO = require("@/assets/images/onboarding/photo-hawaii-hero.jpg");
const SONG_ARTWORK = require("@/assets/images/onboarding/artwork-otro-atardecer.jpg");
const EXTRA_PHOTO = require("@/assets/images/onboarding/photo-hawaii-2.jpg");
const MAP_IMAGE = require("@/assets/images/onboarding/map-waikoloa.jpg");
/* eslint-enable @typescript-eslint/no-require-imports */

// Moods are words (DESIGN.md): place, mood and date read as one Meta line,
// not emoji pills.
const MOCK_DETAIL = {
  song: "Otro Atardecer",
  artist: "Bad Bunny & The Marías",
  reflection: "That week in Hawaii, watching the sunset with nowhere to be.",
  meta: "Waikoloa, HI · Joyful · Aug 2018",
} as const;

export default function TimelinePreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(18);

  useEffect(() => {
    cardOpacity.value = withDelay(250, withTiming(1, { duration: 400 }));
    cardTranslateY.value = withDelay(250, withSpring(0, { damping: 18, stiffness: 180 }));
  }, [cardOpacity, cardTranslateY]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "50%" }]} />
      </View>

      <ScreenHeader leading="back" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        <Text style={styles.heading} accessibilityRole="header">Songs build your story.</Text>
        <Text style={styles.sub}>The more you capture, the richer it gets.</Text>

        <Animated.View style={cardAnimStyle}>
          <RichEntryPreview theme={theme} />
        </Animated.View>

        <Text style={styles.headsUpText}>
          To start, we&apos;ll save two moments together: one quick, one with a bit more depth.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <Button
          label="Save my first moment"
          onPress={() => router.push("/onboarding/capture-1" as any)}
        />
        <Button
          label="Skip for now"
          variant="text"
          tone="secondary"
          fullWidth
          onPress={() =>
            router.replace({ pathname: "/onboarding/celebration", params: { moment1Id: "", moment2Id: "" } } as any)
          }
        />
      </View>
    </View>
  );
}

// An entry as its detail screen shows it: the photo leads, then the song,
// the person's words in Newsreader, and the details as words. Flat on paper.
function RichEntryPreview({ theme }: { theme: Theme }) {
  const s = useMemo(() => createCardStyles(theme), [theme]);
  return (
    <View>
      <AppImage source={HERO_PHOTO} style={s.heroImage} contentFit="cover" />

      <View style={s.body}>
        <View style={s.songRow}>
          <AppImage source={SONG_ARTWORK} style={s.songArtwork} contentFit="cover" />
          <View style={s.songInfo}>
            <Text style={s.songTitle} numberOfLines={1}>{MOCK_DETAIL.song}</Text>
            <Text style={s.artist} numberOfLines={1}>{MOCK_DETAIL.artist}</Text>
          </View>
        </View>

        {/* Static visual scrubber */}
        <View style={s.playRow}>
          <Icon name="play-circle" size={32} color={theme.colors.text} />
          <View style={s.scrubberTrack}>
            <View style={[s.scrubberFill, { width: "38%" }]} />
            <View style={s.scrubberThumb} />
          </View>
          <Text style={s.timeText}>1:23</Text>
        </View>

        <Text style={s.reflection} numberOfLines={3}>{MOCK_DETAIL.reflection}</Text>

        <View style={s.photoStrip}>
          <AppImage source={EXTRA_PHOTO} style={s.photo} contentFit="cover" />
          <AppImage source={MAP_IMAGE} style={s.mapImage} contentFit="cover" />
        </View>

        <Text style={s.meta} numberOfLines={1}>{MOCK_DETAIL.meta}</Text>
      </View>
    </View>
  );
}

function createCardStyles(theme: Theme) {
  return StyleSheet.create({
    heroImage: {
      width: "100%",
      height: 200,
      borderRadius: theme.radii.md,
    },
    body: {
      paddingTop: theme.spacing.md,
      gap: theme.spacing.sm,
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
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      marginBottom: 2,
    },
    artist: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    playRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm + 2,
    },
    scrubberTrack: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      flexDirection: "row",
      alignItems: "center",
    },
    scrubberFill: {
      height: 3,
      backgroundColor: theme.colors.text,
      borderRadius: 2,
    },
    scrubberThumb: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.text,
      marginLeft: -5,
    },
    timeText: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
    reflection: {
      ...theme.typography.reading,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.text,
    },
    photoStrip: {
      flexDirection: "row",
      gap: theme.spacing.xs + 2,
    },
    photo: {
      width: 72,
      height: 72,
      borderRadius: theme.radii.sm,
    },
    mapImage: {
      flex: 1,
      height: 72,
      borderRadius: theme.radii.sm,
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
    },
  });
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressBarFill: {
      height: 3,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the onboarding progress indicator
      borderRadius: 2,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing["2xl"],
    },
    heading: {
      ...theme.typography.headline,
      fontSize: theme.fontSize["2xl"],
      lineHeight: 34,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      ...theme.typography.body,
      lineHeight: 24,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
    },
    headsUpText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.lg,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.xs,
    },
  });
}
