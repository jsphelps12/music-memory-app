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
import { useIsSongPlaying, usePlayerActions } from "@/contexts/PlayerContext";
import { playbackSongId } from "@/lib/playbackStore";
import { useTheme } from "@/hooks/useTheme";
import { momentCardImageUrls } from "@/lib/storage";
import { withoutOthersVideos } from "@/lib/linkedMedia";
import { artworkUrlAtSize } from "@/lib/itunes";
import { moodWords as moodWordsFor } from "@/lib/moodLabels";
import { Theme } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { PlayingIndicator } from "@/components/PlayingIndicator";
import { MomentActionMenu, MenuAnchor, MomentMenuItem } from "@/components/MomentActionMenu";
import { ContextMenuView, type ContextMenuAction } from "@/modules/context-menu";
import { confirmSheet } from "@/components/ConfirmSheet";
import { Icon } from "@/components/Icon";
import {
  DELETE_MOMENT_CONFIRM,
  DELETE_MOMENT_FAILED,
  cardMenuKeys,
  stopSongOfDeletedMoment,
  type CardMenuKey,
} from "@/lib/momentActions";
import { MomentCardData, Song } from "@/types";
import { partStartSeconds } from "@/lib/songPart";

interface Props {
  item: MomentCardData;
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
  /**
   * The signed-in user's id. Required with onDeleted: only the owner gets the
   * long-press menu. A prop rather than useAuth() so a profile refresh doesn't
   * re-render every card in every list.
   */
  currentUserId?: string;
  /**
   * Adds Share, Add to album and Select to the long-press menu (the Journal).
   * The host shows the sheets once, not one per card.
   */
  onMenuAction?: (action: CardMenuAction, item: MomentCardData) => void;
  /**
   * Inside an album (with onMenuAction): every moment gets a menu, with
   * Select for all, Remove from album when canRemoveFromAlbum, and the
   * owner's own rows (Edit, Share, Add to album, Delete) only on their own
   * moments (lib/momentActions.ts, cardMenuKeys).
   */
  inAlbum?: boolean;
  canRemoveFromAlbum?: boolean;
  /** Select mode: a tap ticks the card instead of opening it; no menu. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /**
   * Called as a tap opens the moment, before the screen is pushed: the list
   * hands over its order here (lib/momentSequence.ts) so left and right on
   * the moment flip through it.
   */
  onOpen?: (item: MomentCardData) => void;
}

/**
 * How long a press on a card lasts before it stops being a tap, when the
 * native context menu handles long-press: a little under the system menu's
 * own recognition (its haptic), so letting go right after the haptic never
 * opens the moment.
 */
const NATIVE_MENU_LONG_PRESS_MS = 300;
const noop = () => {};

export type CardMenuAction = "share" | "album" | "select" | "remove";

// The native menu's SF Symbols (the JS fallback draws the Icon names).
const NATIVE_SYMBOLS: Record<CardMenuKey, string> = {
  edit: "pencil",
  share: "square.and.arrow.up",
  album: "rectangle.stack.badge.plus",
  select: "checkmark.circle",
  remove: "minus.circle",
  delete: "trash",
};

// 56pt artwork at 3x. The stored URL is the 600px detail image.
const ARTWORK_PX = 168;

function MomentCardComponent({
  item,
  allMoods,
  collectionId,
  collectionRole,
  showArtist = true,
  onDeleted,
  currentUserId,
  onMenuAction,
  inAlbum = false,
  canRemoveFromAlbum = false,
  selecting = false,
  selected = false,
  onToggleSelect,
  onOpen,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const animatedRef = useAnimatedRef<Animated.View>();
  // Stable actions, plus a selector on just this card's song: play/pause
  // elsewhere doesn't re-render the card, only its own song starting or
  // stopping does.
  const player = usePlayerActions();
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  // Long-press actions are for the owner's own moments only — tagged and
  // shared lists render other users' moments through this same card. Inside
  // an album, everyone in it can Select (and maybe Remove) any moment.
  const own = !!currentUserId && item.userId === currentUserId;
  const menuKeys = useMemo(
    () =>
      cardMenuKeys({
        own,
        deletable: !!onDeleted,
        hostActions: !!onMenuAction,
        album: inAlbum ? { canRemove: canRemoveFromAlbum } : null,
      }),
    [own, onDeleted, onMenuAction, inAlbum, canRemoveFromAlbum]
  );
  const canModify = menuKeys.length > 0;

  // Match by the provider-native ID so both Apple Music and Spotify moments work
  const momentSongId = playbackSongId({ spotifyId: item.songSpotifyId, appleMusicId: item.songAppleMusicId });
  const isThisPlaying = useIsSongPlaying(momentSongId);

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  const handleLongPress = useCallback(() => {
    if (!canModify || selecting) return;
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
  }, [canModify, selecting, animatedRef]);

  const confirmAndDelete = useCallback(async () => {
    const confirmed = await confirmSheet(DELETE_MOMENT_CONFIRM);
    if (!confirmed) return;
    const { error } = await deleteMomentWithCleanup(item);
    if (error) {
      Alert.alert(DELETE_MOMENT_FAILED, friendlyError(error));
      return;
    }
    // The moment is gone — its song shouldn't keep playing (or linger
    // paused in the mini player).
    stopSongOfDeletedMoment(player, item);
    posthog.capture("moment_deleted", { song_title: item.songTitle, song_artist: item.songArtist });
    invalidateMomentCaches(queryClient, currentUserId);
    onDeleted?.(item.id);
  }, [item, posthog, queryClient, currentUserId, onDeleted, player]);

  // The menu runs a row's action once it has finished closing, so the delete
  // confirm can present (iOS drops a Modal that starts mid-dismiss).
  // Edit, Share, Add to album, Select, then the destructive rows last
  // (DESIGN.md, Menus); which of them this card gets is cardMenuKeys'.
  const menuItems = useMemo<MomentMenuItem[]>(() => {
    const rows: Record<CardMenuKey, MomentMenuItem> = {
      edit: {
        key: "edit",
        label: "Edit",
        icon: "pencil-outline",
        onPress: () => router.push(`/moment/edit/${item.id}`),
      },
      share: { key: "share", label: "Share", icon: "share-outline", onPress: () => onMenuAction?.("share", item) },
      album: { key: "album", label: "Add to album", icon: "albums-outline", onPress: () => onMenuAction?.("album", item) },
      select: { key: "select", label: "Select", icon: "checkmark-circle", onPress: () => onMenuAction?.("select", item) },
      remove: {
        key: "remove",
        label: "Remove from album",
        icon: "remove-circle-outline",
        destructive: true,
        onPress: () => onMenuAction?.("remove", item),
      },
      delete: {
        key: "delete",
        label: "Delete",
        icon: "trash-outline",
        destructive: true,
        onPress: () => void confirmAndDelete(),
      },
    };
    return menuKeys.map((key) => rows[key]);
  }, [menuKeys, item, router, confirmAndDelete, onMenuAction]);

  // The iOS context menu (1.4): long-press lifts the card and attaches the
  // menu. Builds without the native view fall back to MomentActionMenu.
  const nativeMenu = canModify && !!ContextMenuView;
  // No actions in select mode: the native view then offers no menu at all
  // (it stays mounted, so the card isn't remounted on the way in or out).
  const nativeActions = useMemo<ContextMenuAction[]>(
    () =>
      selecting
        ? []
        : menuItems.map((m) => ({
            id: m.key,
            title: m.label,
            systemImage: NATIVE_SYMBOLS[m.key as CardMenuKey],
            ...(m.destructive ? { destructive: true } : {}),
          })),
    [selecting, menuItems]
  );
  const onNativeAction = useCallback(
    (e: { nativeEvent: { id: string } }) => {
      menuItems.find((m) => m.key === e.nativeEvent.id)?.onPress();
    },
    [menuItems]
  );

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
      // From the part of the song when it has one (lib/songPart.ts).
      player.playFull(song, item.songPreviewUrl || undefined, partStartSeconds(item.songPartMs));
    }
  }, [item, isThisPlaying, player]);

  const handlePress = useCallback(() => {
    if (selecting) {
      Haptics.selectionAsync();
      onToggleSelect?.(item.id);
      return;
    }
    setCachedMoment(item);
    onOpen?.(item);
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
    // `item`, not just its id: an edited copy with the same id must be what
    // gets cached for the detail screen.
  }, [item, collectionId, collectionRole, router, animatedRef, selecting, onToggleSelect, onOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  // Someone else's linked videos never show (lib/linkedMedia.ts).
  const thumbUrls = momentCardImageUrls(withoutOthersVideos(item, currentUserId));

  // The year only when it isn't this one: lists without month headers
  // (browse, Surprise me, Shared) would otherwise make 2019 read as this fall.
  const momentDay = item.momentDate ? new Date(item.momentDate + "T00:00:00") : null;
  const formattedDate = momentDay
    ? momentDay.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(momentDay.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
      })
    : null;

  // Phase 1: moods as quiet words, not emoji. Capped at 3, in stored order.
  // Deleted custom moods are skipped rather than shown as raw ids.
  const moodWords = moodWordsFor(item.moods, allMoods);

  const canPlay = !!(item.songAppleMusicId || item.songSpotifyId || item.songPreviewUrl);

  const NativeMenu = ContextMenuView;
  const card = (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => {
        scale.set(withSpring(0.98, { damping: 15, stiffness: 300 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 15, stiffness: 300 }));
      }}
      onPress={handlePress}
      // With the native menu, iOS owns the long-press (its haptic is the menu
      // starting). Letting go before the menu has finished opening cancels
      // it, and without an onLongPress here that release counted as a tap
      // and opened the moment. A no-op long-press at the menu's own timing
      // turns any press that long into "not a tap".
      onLongPress={canModify && !selecting ? (nativeMenu ? noop : handleLongPress) : undefined}
      delayLongPress={nativeMenu ? NATIVE_MENU_LONG_PRESS_MS : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${item.songTitle} by ${item.songArtist}${formattedDate ? `, ${formattedDate}` : ""}`}
      accessibilityState={selecting ? { selected } : undefined}
    >
      <View style={styles.header}>
        {/* Tapping the artwork plays; tapping anywhere else opens the entry. */}
        <TouchableOpacity
          onPress={canPlay && !selecting ? handlePlayPress : handlePress}
          // Same as the card: a press long enough to start the menu is never a tap.
          onLongPress={canModify && nativeMenu && !selecting ? noop : undefined}
          delayLongPress={nativeMenu ? NATIVE_MENU_LONG_PRESS_MS : undefined}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={canPlay && !selecting ? `${isThisPlaying ? "Pause" : "Play"} ${item.songTitle}` : undefined}
          style={styles.artworkButton}
        >
          {item.songArtworkUrl ? (
            <AppImage source={{ uri: artworkUrlAtSize(item.songArtworkUrl, ARTWORK_PX) }} style={styles.artwork} transition={200} />
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
        {selecting ? (
          <View style={styles.selectMark}>
            {selected ? (
              <Icon name="checkmark-circle" size={24} color={theme.colors.text} />
            ) : (
              <View style={styles.selectRing} />
            )}
          </View>
        ) : null}
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
  );

  return (
    <Animated.View ref={animatedRef} style={[styles.row, animatedStyle]}>
      {nativeMenu && NativeMenu ? (
        <NativeMenu
          actions={nativeActions}
          onAction={onNativeAction}
          previewBackgroundColor={theme.colors.background}
          previewRadius={theme.radii.lg}
          previewInset={theme.spacing.md}
        >
          {card}
        </NativeMenu>
      ) : (
        card
      )}
      <MomentActionMenu
        anchor={menuAnchor}
        items={menuItems}
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
    // Warm ink over the artwork so the playing bars hold contrast.
    playingScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.overImage.scrim,
      alignItems: "center",
      justifyContent: "center",
    },
    // Select mode's tick: ink when picked, an empty ring when not. Ink, not
    // terracotta: the accent is a signal, and a selection isn't news.
    selectMark: {
      width: 28,
      height: 28,
      marginLeft: theme.spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    selectRing: {
      width: 22,
      height: 22,
      borderRadius: theme.radii.full,
      borderWidth: 1.5,
      borderColor: theme.colors.textTertiary,
    },
    titles: {
      flex: 1,
      marginLeft: theme.spacing.md + 2,
      marginRight: theme.spacing.sm,
    },
    songTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    songArtist: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    date: {
      ...theme.typography.meta,
      alignSelf: "flex-start",
      paddingTop: 2,
      color: theme.colors.textSecondary,
    },
    reflection: {
      ...theme.typography.reading,
      marginTop: theme.spacing.md - 2,
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
      ...theme.typography.meta,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      flexShrink: 1,
    },
    // Moods are words in Meta, sentence case, Umber Gray (DESIGN.md, Entry Row).
    moods: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
      flexShrink: 1,
    },
  });
}

export const MomentCard = memo(MomentCardComponent);
