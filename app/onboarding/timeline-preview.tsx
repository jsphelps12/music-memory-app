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

const MOCK_TIMELINE = [
  {
    section: "May 2026",
    song: "Runaway",
    artist: "Kanye West",
    reflection: "Road trip through Utah. This song on repeat for 400 miles.",
  },
  {
    section: "March 2024",
    song: "Ribs",
    artist: "Lorde",
    reflection: "Last summer before everything changed.",
  },
  {
    section: "November 2019",
    song: "Motion Picture Soundtrack",
    artist: "Radiohead",
    reflection: "Driving home alone, windows down.",
  },
] as const;

export default function TimelinePreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const listOpacity = useSharedValue(0);
  const listTranslateY = useSharedValue(18);

  useEffect(() => {
    listOpacity.value = withDelay(250, withTiming(1, { duration: 400 }));
    listTranslateY.value = withDelay(250, withSpring(0, { damping: 18, stiffness: 180 }));
  }, [listOpacity, listTranslateY]);

  const listAnimStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
    transform: [{ translateY: listTranslateY.value }],
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

        <Animated.View style={listAnimStyle}>
          {MOCK_TIMELINE.map((item, index) => (
            <View key={item.section}>
              <Text style={[styles.sectionHeader, index === 0 && styles.sectionHeaderFirst]}>
                {item.section}
              </Text>
              <MiniMomentRow song={item.song} artist={item.artist} reflection={item.reflection} theme={theme} />
            </View>
          ))}
        </Animated.View>
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

function MiniMomentRow({
  song,
  artist,
  reflection,
  theme,
}: {
  song: string;
  artist: string;
  reflection: string;
  theme: Theme;
}) {
  const rowStyles = useMemo(() => createRowStyles(theme), [theme]);
  return (
    <View style={rowStyles.row}>
      <ArtworkPlaceholder style={rowStyles.artwork} />
      <View style={rowStyles.info}>
        <Text style={rowStyles.song} numberOfLines={1}>{song}</Text>
        <Text style={rowStyles.artist} numberOfLines={1}>{artist}</Text>
        <Text style={rowStyles.reflection} numberOfLines={1}>{reflection}</Text>
      </View>
    </View>
  );
}

function createRowStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    artwork: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.sm,
      marginTop: 2,
    },
    info: {
      flex: 1,
      gap: 2,
    },
    song: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    artist: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
    },
    reflection: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      fontStyle: "italic",
      marginTop: 2,
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
    sectionHeader: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
    },
    sectionHeaderFirst: {
      marginTop: 0,
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
