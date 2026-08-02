import { memo, useCallback, useMemo, useState } from "react";
import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useQueryClient } from "@tanstack/react-query";
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
import { deleteMomentWithCleanup } from "@/lib/deleteMoment";
import { invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { friendlyError } from "@/lib/errors";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { getPublicPhotoUrl, getPublicPhotoThumbnailUrl } from "@/lib/storage";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { MomentActionMenu, MenuAnchor } from "@/components/MomentActionMenu";
import { Moment, Song } from "@/types";

interface Props {
  item: Moment;
  allMoods: Array<{ value: string; emoji: string; label: string }>;
  collectionId?: string;
  collectionRole?: string;
  showArtist?: boolean;
  /**
   * Enables long-press edit/delete. The host list owns its data, so it must
   * remove the moment from local state here — the timeline's stale signal only
   * fires on the next focus, which never comes for an in-place delete.
   */
  onDeleted?: (id: string) => void;
}

function MomentCardComponent({ item, allMoods, collectionId, collectionRole, showArtist = true, onDeleted }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const animatedRef = useAnimatedRef<Animated.View>();
  const player = usePlayer();
  const { user } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  // Long-press actions are for the owner's own moments only — tagged and
  // shared lists render other users' moments through this same card.
  const canModify = !!onDeleted && !!user && item.userId === user.id;

  // Match by the provider-native ID so both Apple Music and Spotify moments work
  const momentSongId = item.songSpotifyId ?? item.songAppleMusicId;
  const playingSongId = player.currentSong?.spotifyId ?? player.currentSong?.appleMusicId;
  const isThisPlaying = !!momentSongId && momentSongId === playingSongId && player.isPlaying;

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  const handleLongPress = useCallback(() => {
    if (!canModify) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Anchor the menu to the card's screen position so it hovers just above
    // the moment being acted on, not in a detached sheet at the bottom.
    runOnUI(() => {
      "worklet";
      const m = measure(animatedRef);
      if (m) {
        runOnJS(setMenuAnchor)({ x: m.pageX, y: m.pageY, width: m.width, height: m.height });
      }
    })();
  }, [canModify, animatedRef]);

  const handleMenuEdit = useCallback(() => {
    setMenuAnchor(null);
    router.push(`/moment/edit/${item.id}`);
  }, [item.id, router]);

  const handleMenuDelete = useCallback(() => {
    setMenuAnchor(null);
    Alert.alert("Delete Moment", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteMomentWithCleanup(item);
          if (error) {
            Alert.alert("Error", friendlyError(error));
            return;
          }
          // The moment is gone — its song shouldn't keep playing (or linger
          // paused in the mini player).
          if (momentSongId && momentSongId === playingSongId) {
            void player.stop();
          }
          posthog.capture("moment_deleted", { song_title: item.songTitle, song_artist: item.songArtist });
          invalidateMomentCaches(queryClient, user?.id);
          onDeleted?.(item.id);
        },
      },
    ]);
  }, [item, posthog, queryClient, user?.id, onDeleted, momentSongId, playingSongId, player]);

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
    // contributorName rides as a param so attribution survives the detail
    // screen's background refetch — mapRowToMoment only derives it for guest
    // rows, so a Shared-with-me card relying on the cached moment alone would
    // lose its "by X" line the instant the fresh row lands.
    const dest = collectionId
      ? { pathname: "/moment/[id]" as const, params: { id: item.id, collectionId, collectionRole, contributorName: item.contributorName ?? undefined } }
      : { pathname: "/moment/[id]" as const, params: { id: item.id, contributorName: item.contributorName ?? undefined } };
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

  // Bare emoji(s) beside the date — deliberately no chips, no labels (owner is
  // wary of card clutter). Capped at 3; a two-mood moment shows both rather
  // than misrepresenting itself as its primary mood alone.
  const moodEmojis = item.moods
    .slice(0, 3)
    .map((value) => allMoods.find((m) => m.value === value)?.emoji)
    .filter(Boolean)
    .join(" ");

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
        onLongPress={canModify ? handleLongPress : undefined}
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
                <Text testID="moment-card-title" style={styles.songTitle} numberOfLines={1}>
                  {item.songTitle}
                </Text>
                {moodEmojis ? (
                  <Text style={styles.moodEmojis}>{moodEmojis}</Text>
                ) : null}
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
      <MomentActionMenu
        anchor={menuAnchor}
        onEdit={handleMenuEdit}
        onDelete={handleMenuDelete}
        onClose={() => setMenuAnchor(null)}
      />
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
    moodEmojis: {
      fontSize: theme.fontSize.xs,
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
