import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";

const MOCK_CARDS = [
  {
    song: "Otro Atardecer",
    artist: "Bad Bunny & The Marías",
    reflection: "That week in Hawaii, watching the sunset with nowhere to be.",
    chips: ["📍 Waikoloa, HI", "🌅 Joyful"],
  },
  {
    song: "Runaway",
    artist: "Kanye West",
    reflection: "Road trip through Utah. This song on repeat for 400 miles.",
    chips: ["@ emma", "🌄 Nostalgic"],
  },
] as const;

export default function ValuePropScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
        <View style={[styles.progressBarFill, { width: "25%" }]} />
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={12}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.heading}>Your life has a soundtrack.</Text>
        <Text style={styles.sub}>
          Save what a song meant — right when you hear it.
        </Text>

        <View style={styles.cardArea}>
          <Animated.View style={[styles.stackWrapper, cardAnimStyle]}>
            {/* Back card — normal flow, peeks above front card via negative marginBottom */}
            <Animated.View style={styles.backCard}>
              <MockMomentCard data={MOCK_CARDS[0]} theme={theme} />
            </Animated.View>
            {/* Front card — renders on top (later in tree) */}
            <Animated.View style={styles.frontCard}>
              <MockMomentCard data={MOCK_CARDS[1]} theme={theme} />
            </Animated.View>
          </Animated.View>

          <View style={styles.callouts}>
            <View style={styles.calloutRow}>
              <Ionicons name="musical-note-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={[styles.calloutText, { color: theme.colors.textSecondary }]}>
                Add a mood, photo, or the people you were with
              </Text>
            </View>
            <View style={styles.calloutRow}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={[styles.calloutText, { color: theme.colors.textSecondary }]}>
                Every moment joins your personal music timeline
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={() => router.push("/onboarding/timeline-preview" as any)}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
            Save my first moment →
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace({ pathname: "/onboarding/celebration", params: { moment1Id: "", moment2Id: "" } } as any)}
          activeOpacity={0.7}
          style={styles.skipLink}
        >
          <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type MockCardData = { song: string; artist: string; reflection: string; chips: readonly string[] };

function MockMomentCard({ data, theme }: { data: MockCardData; theme: Theme }) {
  const cardStyles = useMemo(() => createCardStyles(theme), [theme]);
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.row}>
        <ArtworkPlaceholder style={cardStyles.artwork} />
        <View style={cardStyles.info}>
          <Text style={cardStyles.songName} numberOfLines={1}>{data.song}</Text>
          <Text style={cardStyles.artist} numberOfLines={1}>{data.artist}</Text>
        </View>
      </View>
      <Text style={cardStyles.reflection} numberOfLines={2}>{data.reflection}</Text>
      <View style={cardStyles.chips}>
        {data.chips.map((chip) => (
          <View key={chip} style={cardStyles.chip}>
            <Text style={cardStyles.chipText}>{chip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createCardStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      padding: 14,
      gap: theme.spacing.sm,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.cardBg,
    },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    artwork: { width: 44, height: 44, borderRadius: theme.radii.sm },
    info: { flex: 1 },
    songName: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
      marginBottom: 2,
    },
    artist: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
    reflection: {
      fontSize: theme.fontSize.xs,
      lineHeight: 18,
      fontStyle: "italic",
      color: theme.colors.textSecondary,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 3,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.chipBg,
    },
    chipText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
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
      backgroundColor: theme.colors.accent,
      borderRadius: 2,
    },
    backButton: {
      position: "absolute",
      top: 56,
      left: theme.spacing.xl,
      zIndex: 10,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 88,
    },
    heading: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      lineHeight: 24,
      marginBottom: theme.spacing["2xl"],
    },
    cardArea: {
      flex: 1,
      justifyContent: "center",
      paddingBottom: 24,
    },
    stackWrapper: {},
    callouts: {
      marginTop: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    calloutRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    calloutText: {
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      flex: 1,
    },
    backCard: {
      marginBottom: -108,
      marginHorizontal: 6,
      transform: [{ rotate: "-4deg" }, { scale: 0.97 }],
      opacity: 0.85,
    },
    frontCard: {
      transform: [{ rotate: "1.5deg" }],
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      paddingTop: 12,
      gap: 8,
    },
    primaryButton: {
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    skipLink: {
      alignItems: "center",
      paddingVertical: 8,
    },
    skipText: {
      fontSize: theme.fontSize.sm,
    },
  });
}
