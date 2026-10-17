import { memo, useCallback, useMemo, useState } from "react";
import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { AppImage } from "@/components/AppImage";
import { useRouter } from "expo-router";
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
import { PlayingIndicator } from "@/components/PlayingIndicator";
import { MomentActionMenu, MenuAnchor } from "@/components/MomentActionMenu";
import { confirmSheet } from "@/components/ConfirmSheet";
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

  const handleMenuDelete = useCallback(async () => {
    setMenuAnchor(null);
    const confirmed = await confirmSheet({
      title: "Delete Moment",
      message: "Are you sure? This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
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

  // Phase 1: moods as quiet words, not emoji. Capped at 3, in stored order.
  const moodWords = item.moods
    .slice(0, 3)
    .map((value) => allMoods.find((m) => m.value === value)?.label ?? value)
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  const canPlay = !!(item.songAppleMusicId || item.songSpotifyId || item.songPreviewUrl);

  return (
    <Animated.View ref={animatedRef} style={[styles.row, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={handlePress}
        onLongPress={canModify ? handleLongPress : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${item.songTitle} by ${item.songArtist}${formattedDate ? `, ${formattedDate}` : ""}`}
      >
        <View style={styles.header}>
          {/* Tapping the artwork plays; tapping anywhere else opens the entry. */}
          <TouchableOpacity
            onPress={canPlay ? handlePlayPress : handlePress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={canPlay ? `${isThisPlaying ? "Pause" : "Play"} ${item.songTitle}` : undefined}
            style={styles.artworkButton}
          >
            {item.songArtworkUrl ? (
              <AppImage source={{ uri: item.songArtworkUrl }} style={styles.artwork} transition={200} />
            ) : (
              <ArtworkPlaceholder style={styles.artwork} />
            )}
            {isThisPlaying && (
              <View style={styles.playingScrim}>
                <PlayingIndicator />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.titles}>
            <Text testID="moment-card-title" style={styles.songTitle} numberOfLines={1}>
              {item.songTitle}
            </Text>
            {showArtist && (
              <Text style={styles.songArtist} numberOfLines={1}>
                {item.songArtist}
              </Text>
            )}
          </View>
          {formattedDate ? <Text style={styles.date}>{formattedDate}</Text> : null}
        </View>

        {item.reflectionText ? (
          <Text style={styles.reflection} numberOfLines={3}>
            {/* An excerpt reads as one flowing paragraph; the entry screen
                keeps the line breaks. */}
            {item.reflectionText.replace(/\s+/g, " ").trim()}
          </Text>
        ) : null}

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

        {(moodWords || item.contributorName) ? (
          <View style={styles.metaRow}>
            {item.contributorName ? (
              <Text style={styles.contributor} numberOfLines={1}>From {item.contributorName}</Text>
            ) : null}
            {moodWords ? <Text style={styles.moods} numberOfLines={1}>{moodWords}</Text> : null}
          </View>
        ) : null}
      </TouchableOpacity>
      <MomentActionMenu
        anchor={menuAnchor}
        onEdit={handleMenuEdit}
        onDelete={handleMenuDelete}
        onClose={() => setMenuAnchor(null)}
      />
    </Animated.View>
  );
}

// Phase 1 (2026-10, "let the artwork be the color"): no card box, fill,
// border or shadow. Rows are separated by a hairline and the artwork carries
// the color.
function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
    },
    artworkButton: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
    },
    artwork: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.sm,
    },
    playingScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(20,18,24,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    titles: {
      flex: 1,
      marginLeft: theme.spacing.md + 2,
      marginRight: theme.spacing.sm,
    },
    songTitle: {
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
    date: {
      alignSelf: "flex-start",
      paddingTop: 2,
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    reflection: {
      marginTop: theme.spacing.md - 2,
      fontSize: 17,
      lineHeight: 25,
      fontFamily: theme.fonts.reading,
      color: theme.colors.text,
    },
    photoStrip: {
      marginTop: theme.spacing.md,
      height: 72,
    },
    photoStripContent: {
      gap: 4,
    },
    photoStripThumb: {
      width: 72,
      height: 72,
      borderRadius: 6,
    },
    metaRow: {
      marginTop: theme.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    contributor: {
      fontSize: 13,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      flexShrink: 1,
    },
    moods: {
      fontSize: 11,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 1,
      color: theme.colors.textTertiary,
      flexShrink: 1,
    },
  });
}

export const MomentCard = memo(MomentCardComponent);
