import { memo, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import { AppImage } from "@/components/AppImage";
import { useRouter } from "expo-router";
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
import { getPublicPhotoUrl, getPublicPhotoThumbnailUrl } from "@/lib/storage";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Moment, Song } from "@/types";

interface Props {
  item: Moment;
  allMoods: Array<{ value: string; emoji: string; label: string }>;
  collectionId?: string;
  collectionRole?: string;
  showArtist?: boolean;
}

function MomentCardComponent({ item, allMoods, collectionId, collectionRole, showArtist = true }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const animatedRef = useAnimatedRef<Animated.View>();
  const player = usePlayer();

  // Match by the provider-native ID so both Apple Music and Spotify moments work
  const momentSongId = item.songSpotifyId ?? item.songAppleMusicId;
  const playingSongId = player.currentSong?.spotifyId ?? player.currentSong?.appleMusicId;
  const isThisPlaying = !!momentSongId && momentSongId === playingSongId && player.isPlaying;

  const handlePlayPress = useCallback(() => {
    if (isThisPlaying) {
      player.pause();
    } else {
      const song: Song = {
        id: item.songSpotifyId ?? item.songAppleMusicId ?? "",
        title: item.songTitle,
        artistName: item.songArtist,
        albumName: item.songAlbumName,
        artworkUrl: item.songArtworkUrl ?? "",
        provider: item.songProvider ?? 'apple_music',
        appleMusicId: item.songAppleMusicId ?? null,
        spotifyId: item.songSpotifyId ?? null,
        durationMs: 0,
      };
      player.playFull(song, item.songPreviewUrl || undefined);
    }
  }, [item, isThisPlaying, player]);

  const handlePress = useCallback(() => {
    setCachedMoment(item);
    const dest = collectionId
      ? { pathname: "/moment/[id]" as const, params: { id: item.id, collectionId, collectionRole, contributorName: item.contributorName ?? undefined } }
      : { pathname: "/moment/[id]" as const, params: { id: item.id } };
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
      runOnJS(router.push)(dest);
    })();
  }, [item.id, item.contributorName, collectionId, collectionRole, router]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const thumbUrls =
    item.photoThumbnails.length > 0
      ? item.photoThumbnails.map((p) => getPublicPhotoThumbnailUrl(p))
      : item.photoUrls.map((p) => getPublicPhotoUrl(p));

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
              <AppImage source={{ uri: item.songArtworkUrl }} style={styles.artwork} transition={200} />
            ) : (
              <ArtworkPlaceholder style={styles.artwork} />
            )}
            <View style={styles.cardContent}>
              <View style={styles.titleRow}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {item.songTitle}
                </Text>
                {formattedDate ? (
                  <Text style={styles.date}>{formattedDate}</Text>
                ) : null}
              </View>
              {showArtist && (
                <Text style={styles.songArtist} numberOfLines={1}>
                  {item.songArtist}
                </Text>
              )}
            </View>
          </View>
          {item.reflectionText ? (
            <Text style={styles.reflection} numberOfLines={2}>
              {item.reflectionText}
            </Text>
          ) : null}
          {(thumbUrls.length > 0 || !!item.contributorName) && (
            <View style={styles.photoRow}>
              {thumbUrls.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoStrip}
                  contentContainerStyle={styles.photoStripContent}
                >
                  {thumbUrls.map((url, i) => (
                    <AppImage
                      key={i}
                      source={{ uri: url }}
                      style={styles.photoStripThumb}
                      contentFit="cover"
                      transition={200}
                    />
                  ))}
                </ScrollView>
              )}
              {item.contributorName ? (
                <View style={styles.authorBadge}>
                  <Text style={styles.authorBadgeText} numberOfLines={1}>
                    {item.contributorName}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </TouchableOpacity>
      {item.songAppleMusicId ? (
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    cardBody: {
      padding: 10,
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
    playButton: {
      position: "absolute",
      top: 10 + 56 - 22 - 3,
      left: 10 + 56 - 22 - 3,
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
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    songTitle: {
      flex: 1,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    reflection: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      fontStyle: "italic",
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      lineHeight: 20,
    },
    date: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      flexShrink: 0,
    },
    photoRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: theme.spacing.sm,
    },
    photoStrip: {
      flex: 1,
      height: 80,
    },
    photoStripContent: {
      gap: 2,
    },
    photoStripThumb: {
      width: 80,
      height: 80,
    },
    authorBadge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
      marginLeft: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      maxWidth: 100,
    },
    authorBadgeText: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
  });
}

export const MomentCard = memo(MomentCardComponent);
