import { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useAnimatedRef,
  measure,
  runOnUI,
  runOnJS,
} from "react-native-reanimated";
import { setCardOrigin } from "@/lib/cardTransition";
import { setCachedMoment } from "@/lib/momentCache";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { getPublicPhotoUrl } from "@/lib/storage";
import { Theme } from "@/constants/theme";
import { Moment, Song } from "@/types";

interface Props {
  item: Moment;
  onPress: () => void;
  allMoods: Array<{ value: string; emoji: string; label: string }>;
  showArtist?: boolean;
}

export function MomentCard({ item, onPress, allMoods, showArtist = true }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const animatedRef = useAnimatedRef<Animated.View>();
  const player = usePlayer();

  const isThisPlaying =
    player.currentSong?.appleMusicId === item.songAppleMusicId && player.isPlaying;

  const handlePlayPress = useCallback(() => {
    if (!item.songPreviewUrl) return;
    if (isThisPlaying) {
      player.pause();
    } else {
      const song: Song = {
        id: item.songAppleMusicId,
        title: item.songTitle,
        artistName: item.songArtist,
        albumName: item.songAlbumName,
        artworkUrl: item.songArtworkUrl ?? "",
        appleMusicId: item.songAppleMusicId,
        durationMs: 0,
      };
      player.play(song, item.songPreviewUrl);
    }
  }, [item, isThisPlaying, player]);

  const handlePress = useCallback(() => {
    setCachedMoment(item);
    const { width: sw, height: sh } = Dimensions.get("window");
    runOnUI(() => {
      "worklet";
      const m = measure(animatedRef);
      if (m) {
        runOnJS(setCardOrigin)(
          (m.pageX + m.width / 2) - sw / 2,
          (m.pageY + m.height / 2) - sh / 2,
          m.width / sw
        );
      }
      runOnJS(onPress)();
    })();
  }, [item, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const mood = item.mood ? allMoods.find((m) => m.value === item.mood) : undefined;
  const thumbUrls =
    item.photoThumbnails.length > 0
      ? item.photoThumbnails.map(getPublicPhotoUrl)
      : item.photoUrls.map(getPublicPhotoUrl);

  const formattedDate = item.momentDate
    ? new Date(item.momentDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Animated.View ref={animatedRef} style={[styles.wrapper, animatedStyle, !theme.isDark && theme.shadows.card]}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={handlePress}
      >
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            {item.songArtworkUrl ? (
              <Image source={{ uri: item.songArtworkUrl }} style={styles.artwork} />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            <View style={styles.cardContent}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {item.songTitle}
              </Text>
              {showArtist && (
                <Text style={styles.songArtist} numberOfLines={1}>
                  {item.songArtist}
                </Text>
              )}
              {item.contributorName ? (
                <Text style={styles.contributor} numberOfLines={1}>
                  by {item.contributorName}
                </Text>
              ) : null}
              {item.reflectionText ? (
                <Text style={styles.reflection} numberOfLines={2}>
                  {item.reflectionText}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.cardMeta}>
            {mood ? (
              <View style={styles.moodChip}>
                <Text style={styles.moodChipText}>
                  {mood.emoji} {mood.label}
                </Text>
              </View>
            ) : null}
            {formattedDate ? (
              <Text style={styles.date}>{formattedDate}</Text>
            ) : null}
          </View>
        </View>
        {thumbUrls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoStrip}
            contentContainerStyle={styles.photoStripContent}
          >
            {thumbUrls.map((url, i) => (
              <Image
                key={i}
                source={{ uri: url }}
                style={styles.photoStripThumb}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        )}
      </TouchableOpacity>
      {item.songPreviewUrl ? (
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPress}
          hitSlop={8}
        >
          <Ionicons
            name={isThisPlaying ? "pause" : "play"}
            size={13}
            color="#fff"
          />
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrapper: {
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.md,
    },
    card: {
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      overflow: "hidden",
    },
    cardBody: {
      padding: theme.spacing.md,
    },
    cardRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    artworkPlaceholder: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    playButton: {
      position: "absolute",
      // artwork is at (cardBody padding, cardBody padding); button sits at its bottom-right
      top: theme.spacing.md + 56 - 22 - 3,
      left: theme.spacing.md + 56 - 22 - 3,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    cardContent: {
      flex: 1,
      marginLeft: theme.spacing.md,
    },
    songTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    contributor: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.accent,
      marginTop: 2,
      fontWeight: theme.fontWeight.medium,
    },
    reflection: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 6,
      lineHeight: 20,
    },
    cardMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
      flex: 1,
    },
    moodChip: {
      paddingHorizontal: 10,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
    },
    moodChipText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.chipText,
    },
    date: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginLeft: "auto",
    },
    photoStrip: {
      height: 80,
    },
    photoStripContent: {
      gap: 2,
    },
    photoStripThumb: {
      width: 80,
      height: 80,
    },
  });
}
