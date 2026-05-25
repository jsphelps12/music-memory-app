import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
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

const MOCK_DETAIL = {
  song: "Otro Atardecer",
  artist: "Bad Bunny & The Marías",
  reflection: "That week in Hawaii, watching the sunset with nowhere to be.",
  chips: ["📍 Waikoloa, HI", "🌅 Joyful", "Aug 2018"],
} as const;

export default function TimelinePreviewScreen() {
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
        <View style={[styles.progressBarFill, { width: "50%" }]} />
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={12}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        <Text style={styles.heading}>Songs build your story.</Text>
        <Text style={styles.sub}>
          The more you capture, the richer it gets.
        </Text>

        <Animated.View style={cardAnimStyle}>
          <RichMomentCard theme={theme} />
        </Animated.View>

        <Text style={styles.headsUpText}>
          To start, we'll save two moments together — one quick, one with a bit more depth.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={() => router.push("/onboarding/capture-1" as any)}
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

function RichMomentCard({ theme }: { theme: Theme }) {
  const cardStyles = useMemo(() => createCardStyles(theme), [theme]);
  return (
    <View style={cardStyles.card}>
      <ArtworkPlaceholder style={cardStyles.artwork} />
      <View style={cardStyles.body}>
        <Text style={cardStyles.songTitle} numberOfLines={1}>{MOCK_DETAIL.song}</Text>
        <Text style={cardStyles.artist} numberOfLines={1}>{MOCK_DETAIL.artist}</Text>
        <Text style={cardStyles.reflection} numberOfLines={3}>{MOCK_DETAIL.reflection}</Text>
        <View style={cardStyles.chips}>
          {MOCK_DETAIL.chips.map((chip) => (
            <View key={chip} style={cardStyles.chip}>
              <Text style={cardStyles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function createCardStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      overflow: "hidden",
    },
    artwork: {
      width: "100%",
      height: 170,
    },
    body: {
      backgroundColor: theme.colors.backgroundSecondary,
      padding: 14,
      gap: theme.spacing.sm,
    },
    songTitle: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    artist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    reflection: {
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
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
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 88,
      paddingBottom: 24,
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
    headsUpText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 20,
      textAlign: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.lg,
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
