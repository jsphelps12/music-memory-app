import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Linking,
  AccessibilityInfo,
  useWindowDimensions,
} from "react-native";
import type { AccessibilityActionEvent, AccessibilityActionInfo, ViewInstance } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useReducedMotion,
  interpolate,
  Extrapolation,
  withSequence,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { consumeCardOrigin } from "@/lib/cardTransition";
import { consumeCachedMoment } from "@/lib/momentCache";
import {
  consumeMomentSequence,
  flipDirection,
  momentAt,
  rubberBand,
  shouldClose,
  stepIndex,
} from "@/lib/momentSequence";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerActions, usePlayerControls, usePlayerProgress } from "@/contexts/PlayerContext";
import { playAction } from "@/lib/playerAction";
import { formatSongTime, partFraction, partStartSeconds } from "@/lib/songPart";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl, momentCardImageUrls } from "@/lib/storage";
import { deleteGuestMoment, deleteMomentWithCleanup } from "@/lib/deleteMoment";
import {
  fetchAlbums,
  fetchAlbumIdsContainingMoment,
  addMomentToAlbum,
  removeMomentFromAlbum,
} from "@/lib/albums";
import { canPassOn, fetchMomentForViewer } from "@/lib/momentView";
import {
  DELETE_MOMENT_CONFIRM,
  DELETE_MOMENT_FAILED,
  REMOVE_FROM_ALBUM_CONFIRM,
  REMOVE_FROM_ALBUM_FAILED,
  stopSongOfDeletedMoment,
} from "@/lib/momentActions";
import { FEEDBACK_EMAIL, MAIL_UNAVAILABLE_TEXT, mailtoUrl, openMail } from "@/lib/mail";
import { MOODS } from "@/constants/Moods";
import { moodWords } from "@/lib/moodLabels";
import { useTheme } from "@/hooks/useTheme";
import { Theme, overImage } from "@/constants/theme";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { SkeletonMomentDetail } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MomentFilm } from "@/components/MomentFilm";
import { confirmSheet, ConfirmSheetHost } from "@/components/ConfirmSheet";
import { friendlyError } from "@/lib/errors";
import { Album, Moment, PartialMoment } from "@/types";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { invalidateMomentCaches, invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { ShareMomentSheet } from "@/components/ShareMomentSheet";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import { IconButton } from "@/components/IconButton";
import { MomentActionMenu, MomentMenuButton, MenuAnchor, MomentMenuItem } from "@/components/MomentActionMenu";
import { Icon } from "@/components/Icon";
import { formatTime } from "@/lib/formatTime";
import { runWhenIdle } from "@/lib/whenIdle";
import { HeroPhotoCycle } from "@/components/HeroPhotoCycle";
import { VoiceNoteRow } from "@/components/VoiceNoteRow";
import { useMediaSources } from "@/hooks/useMediaSources";
import { withoutOthersVideos } from "@/lib/linkedMedia";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

type ScreenState = "loading" | "not_found" | "error" | "ready";

/** Focus refetch cooldown (CLAUDE.md: screen-level stale time). */
const STALE_TIME = 2 * 60 * 1000;

/**
 * Past BottomSheet's close (220ms): iOS drops a Modal that starts presenting
 * while another is still dismissing.
 */

// Over photos and artwork only (DESIGN.md allows warm ink and night over
// imagery): the photo counter, and the shadow under lifted artwork.
const INK_GLASS = overImage.glass;
const PAPER_ON_GLASS = overImage.text;

/** A clip's length for its badge: "0:12", "1:05". */
function clipLength(ms: number | undefined): string {
  const total = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Where a touch at `x` on the progress bar seeks to, in seconds. */
function seekSeconds(x: number, barWidth: number, duration: number): number {
  "worklet";
  return Math.max(0, Math.min(1, x / barWidth)) * duration;
}

type PanGesture = ReturnType<typeof Gesture.Pan>;

/** One page of the flip: which moment, where it sits in the list, how it came in. */
interface Page {
  id: string;
  /** Its position in the sequence (0 without one). */
  index: number;
  /** What the card tap or the list already had, shown while the full row loads. */
  initial: PartialMoment | null;
  /** 0 opened; 1 flipped to the next (came in from the right); -1 to the previous. */
  flip: -1 | 0 | 1;
}

// The page flip: the page leaves the way the finger was going, the next one
// slides a quarter-width in from the other side as it fades up.
const FLIP_OUT = { duration: 180, easing: Easing.out(Easing.quad) };
const FLIP_IN = { duration: 240, easing: Easing.out(Easing.cubic) };
const FLIP_IN_OFFSET = 0.25;
// A drag let go short of a flip or a close: straight back, no overshoot (an
// overshoot past 0 would show the Journal behind this overlay).
const SETTLE = { damping: 30, stiffness: 320, overshootClamping: true };
const CLOSE_OUT = { duration: 220, easing: Easing.out(Easing.cubic) };
// Pans: a flip claims a drag within ~29° of horizontal (18pt across before
// 10pt down); a close one steeper than ~53° (16pt down before 12pt across),
// and only from the top of the page. Between the two, the drag only scrolls.
const FLIP_ACTIVE_X = 18;
const FLIP_FAIL_Y = 10;
const CLOSE_ACTIVE_Y = 16;
const CLOSE_FAIL_X = 12;
// Scrolled further than this, a downward drag scrolls back up instead of closing.
const TOP_SLOP = 1;

function flipTick() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * The moment overlay. It owns what outlives a page: the entry from the card,
 * swipe down to close, and left/right through the list the moment was opened
 * from (lib/momentSequence.ts). Each moment is a MomentPage, remounted by key
 * on a flip, so everything about the last one (its fetch, autoplay timer,
 * sheets, album ticks) goes with it.
 *
 * One page is mounted, not two: a page autoplays, fetches on focus, and can
 * hold a map, the film and five sheets, so a second live one beside it would
 * double all of that for the length of a drag. Instead the page leaves with
 * the finger, the paper behind shows for a beat, and the next slides in.
 * With the list's card data the next page draws at once, with no skeleton.
 */
export default function MomentDetailScreen() {
  const {
    id,
    returnTo,
    collectionId,
    collectionRole,
    contributorName,
  } = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    collectionId?: string;
    collectionRole?: string;
    contributorName?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const playerActions = usePlayerActions();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Left and right only when a list handed over its order (the Journal, an
  // album); a moment opened anywhere else doesn't flip at all.
  const [sequence] = useState(() => consumeMomentSequence(id));
  // Only accept the cached moment if it's actually the one being opened. A
  // swallowed navigation leaves a stale value in the module-level slot, and
  // entries that don't populate it (push-notification taps) would otherwise
  // render — and autoplay — someone else's moment.
  // Until the full row lands, a card hand-off only has card columns: people,
  // location, weather, updatedAt and shareToken are undefined, not empty.
  const [page, setPage] = useState<Page>(() => {
    const cached = consumeCachedMoment();
    return {
      id,
      index: sequence?.index ?? 0,
      initial: cached && cached.id === id ? cached : sequence ? momentAt(sequence, sequence.index) : null,
      flip: 0,
    };
  });
  const hasPrev = !!sequence && stepIndex(sequence, page.index, -1) !== null;
  const hasNext = !!sequence && stepIndex(sequence, page.index, 1) !== null;

  const [origin] = useState(() => consumeCardOrigin());
  const translateX = useSharedValue(origin.active ? origin.x : 0);
  const translateY = useSharedValue(origin.active ? origin.y : 0);
  const scaleAnim = useSharedValue(origin.active ? origin.scale : 1);
  const opacity = useSharedValue(origin.active ? 0 : 1);
  // Swipe down to close: how far the whole overlay has been pulled.
  const dragY = useSharedValue(0);
  // The flip: the page's sideways offset and fade.
  const flipX = useSharedValue(0);
  const pageOpacity = useSharedValue(1);
  // A flip or close is animating: new drags wait for it.
  const busy = useSharedValue(false);
  // The page's scroll offset, written by the page; a close starts only at the top.
  const scrollY = useSharedValue(0);
  const canPrev = useSharedValue(hasPrev);
  const canNext = useSharedValue(hasNext);
  useLayoutEffect(() => {
    canPrev.set(hasPrev);
    canNext.set(hasNext);
  }, [canPrev, canNext, hasPrev, hasNext]);

  const animateOut = useCallback((then: () => void) => {
    opacity.set(withTiming(0, { duration: 120 }));
    scaleAnim.set(
      withTiming(0.95, { duration: 120 }, () => {
        "worklet";
        runOnJS(then)();
      })
    );
  }, [opacity, scaleAnim]);

  const goBack = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.back();
    }
  }, [router, returnTo]);

  const close = useCallback(() => animateOut(goBack), [animateOut, goBack]);
  // Analytics for the two ways a person closes it (a delete closes it too,
  // through `close`, and isn't counted here).
  const posthog = usePostHog();
  const closeByBack = useCallback(() => {
    posthog?.capture("moment_closed", { via: "back" });
    close();
  }, [posthog, close]);
  const closedBySwipe = useCallback(() => {
    posthog?.capture("moment_closed", { via: "swipe_down" });
    goBack();
  }, [posthog, goBack]);

  // The entry from the card that was tapped: the first page only.
  useEffect(() => {
    const config = { duration: 320, easing: Easing.out(Easing.cubic) };
    opacity.set(withTiming(1, { duration: 180 }));
    translateX.set(withTiming(0, config));
    translateY.set(withTiming(0, config));
    scaleAnim.set(withTiming(1, config));
  }, [opacity, translateX, translateY, scaleAnim]);

  // The song of the moment on screen, as its page last reported it (the full
  // row once it lands): a flip stops it. Shared values, not refs, for this
  // and the page index: flipTo runs from the pans, and the React Compiler
  // can't optimize a screen whose gestures reach refs.
  const shownSong = useSharedValue<{ songSpotifyId: string | null; songAppleMusicId: string | null } | null>(null);
  const onShown = useCallback((m: PartialMoment) => {
    shownSong.set({ songSpotifyId: m.songSpotifyId ?? null, songAppleMusicId: m.songAppleMusicId ?? null });
  }, [shownSong]);
  const pageIndex = useSharedValue(page.index);

  // Runs once the old page is out of sight.
  const flipTo = useCallback((dir: 1 | -1) => {
    const nextIndex = sequence ? stepIndex(sequence, pageIndex.get(), dir) : null;
    if (!sequence || nextIndex === null) {
      flipX.set(withSpring(0, SETTLE));
      pageOpacity.set(withTiming(1, { duration: 160 }));
      busy.set(false);
      return;
    }
    // The old moment's song stops, by the same rule as deleting it: only if
    // it's the song loaded, or nothing is yet (that cancels its autoplay if
    // still waiting on Apple Music). The next page autoplays its own.
    const outgoing = shownSong.get();
    if (outgoing) stopSongOfDeletedMoment(playerActions, outgoing, { orIdle: true });
    shownSong.set(null);
    pageIndex.set(nextIndex);
    setPage({ id: sequence.ids[nextIndex], index: nextIndex, initial: momentAt(sequence, nextIndex), flip: dir });
    posthog?.capture("moment_flipped", { direction: dir === 1 ? "next" : "prev" });
  }, [sequence, playerActions, flipX, pageOpacity, busy, shownSong, pageIndex, posthog]);

  // The new page comes in (flips only; the first page has the card entry).
  useLayoutEffect(() => {
    if (page.flip === 0) return;
    scrollY.set(0);
    const from = reduceMotion ? 0 : page.flip * screenWidth * FLIP_IN_OFFSET;
    flipX.set(withSequence(withTiming(from, { duration: 0 }), withTiming(0, FLIP_IN)));
    pageOpacity.set(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 200 }, () => {
          "worklet";
          busy.set(false);
        })
      )
    );
  }, [page, reduceMotion, screenWidth, scrollY, flipX, pageOpacity, busy]);

  // Swipe down to close, like the full-screen player in Apple Music. Only
  // from the top of the page: scrolled down, a downward drag scrolls back up.
  // It's simultaneous with the page's scroll (declared on the page's side),
  // so the scroll is never cancelled while this decides; at the top the page
  // doesn't bounce (MomentPage), so the overlay moves and the writing doesn't.
  const closePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(CLOSE_ACTIVE_Y)
        .failOffsetY(-8)
        .failOffsetX([-CLOSE_FAIL_X, CLOSE_FAIL_X])
        .onTouchesDown((_e, manager) => {
          "worklet";
          if (busy.get() || scrollY.get() > TOP_SLOP) manager.fail();
        })
        .onUpdate((e) => {
          "worklet";
          // If the page does bounce (a fling just landed at the top), take the
          // bounce out so the overlay still tracks the finger exactly.
          dragY.set(Math.max(0, e.translationY + Math.min(0, scrollY.get())));
        })
        .onEnd((e, success) => {
          "worklet";
          if (success && shouldClose(dragY.get(), e.velocityY)) {
            busy.set(true);
            dragY.set(
              withTiming(screenHeight, CLOSE_OUT, () => {
                "worklet";
                runOnJS(closedBySwipe)();
              })
            );
          } else {
            dragY.set(withSpring(0, SETTLE));
          }
        }),
    [busy, scrollY, dragY, screenHeight, closedBySwipe]
  );

  // Left and right through the list. Off when there's no list: a lone moment
  // doesn't even rubber-band. Past either end it rubber-bands and settles.
  // The seek bar and the photo strip block it (MomentPage), so their own
  // horizontal drags always win.
  const flipPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!sequence)
        .activeOffsetX([-FLIP_ACTIVE_X, FLIP_ACTIVE_X])
        .failOffsetY([-FLIP_FAIL_Y, FLIP_FAIL_Y])
        .onTouchesDown((_e, manager) => {
          "worklet";
          if (busy.get()) manager.fail();
        })
        .onUpdate((e) => {
          "worklet";
          const tx = e.translationX;
          const open = tx < 0 ? canNext.get() : canPrev.get();
          flipX.set(open ? tx : rubberBand(tx, screenWidth));
          pageOpacity.set(open ? interpolate(Math.abs(tx), [0, screenWidth], [1, 0.4], Extrapolation.CLAMP) : 1);
        })
        .onEnd((e, success) => {
          "worklet";
          const dir = success
            ? flipDirection(e.translationX, e.velocityX, screenWidth, canPrev.get(), canNext.get())
            : 0;
          if (dir !== 0) {
            busy.set(true);
            runOnJS(flipTick)();
            pageOpacity.set(withTiming(0, FLIP_OUT));
            flipX.set(
              withTiming(-dir * screenWidth, FLIP_OUT, () => {
                "worklet";
                runOnJS(flipTo)(dir);
              })
            );
          } else {
            flipX.set(withSpring(0, SETTLE));
            pageOpacity.set(withTiming(1, { duration: 160 }));
          }
        }),
    [sequence, busy, canPrev, canNext, flipX, pageOpacity, screenWidth, flipTo]
  );

  // Whichever claims the drag first; they never both run.
  const overlayGesture = useMemo(() => Gesture.Race(closePan, flipPan), [closePan, flipPan]);

  // VoiceOver: "Next moment" / "Previous moment" as actions on the song title
  // (swipe up or down on it), and the two-finger scrub closes.
  const flipByAction = useCallback((dir: 1 | -1) => {
    if (busy.get()) return;
    busy.set(true);
    flipTick();
    pageOpacity.set(
      withTiming(0, { duration: 120 }, () => {
        "worklet";
        runOnJS(flipTo)(dir);
      })
    );
  }, [busy, pageOpacity, flipTo]);
  const flipActions = useMemo<AccessibilityActionInfo[]>(
    () => [
      ...(hasPrev ? [{ name: "previous", label: "Previous moment" }] : []),
      ...(hasNext ? [{ name: "next", label: "Next moment" }] : []),
    ],
    [hasPrev, hasNext]
  );
  const onFlipAction = useCallback((e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "next") flipByAction(1);
    else if (e.nativeEvent.actionName === "previous") flipByAction(-1);
  }, [flipByAction]);

  const animStyle = useAnimatedStyle(() => {
    const pulled = dragY.get();
    return {
      opacity: opacity.get(),
      // Pulled down, it lifts away as a card: corners round, it eases smaller.
      borderRadius: interpolate(pulled, [0, 120], [0, 24], Extrapolation.CLAMP),
      transform: [
        { translateX: translateX.get() },
        { translateY: translateY.get() + pulled },
        { scale: scaleAnim.get() * interpolate(pulled, [0, screenHeight], [1, 0.9], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <GestureDetector gesture={overlayGesture}>
      <Animated.View
        style={[styles.container, animStyle]}
        onAccessibilityEscape={closeByBack}
        testID="moment-detail"
      >
        <MomentPage
          key={`${page.index}:${page.id}`}
          id={page.id}
          initial={page.initial}
          flipped={page.flip !== 0}
          contributorName={page.flip === 0 ? contributorName : (page.initial?.contributorName ?? undefined)}
          collectionId={collectionId}
          collectionRole={collectionRole}
          scrollY={scrollY}
          flipX={flipX}
          pageOpacity={pageOpacity}
          flipPan={flipPan}
          closePan={closePan}
          onClose={close}
          onBack={closeByBack}
          onShown={onShown}
          flipActions={flipActions}
          onFlipAction={onFlipAction}
        />
        {/* Own confirm host: this screen is a native modal, where the root
            host's sheet cannot present (iOS silently drops it). It answers
            while this screen is focused; the root host again once it closes.
            Here rather than in the page, so a flip doesn't remount it. */}
        <ConfirmSheetHost />
      </Animated.View>
    </GestureDetector>
  );
}

interface MomentPageProps {
  id: string;
  initial: PartialMoment | null;
  /** Came in by a flip: VoiceOver hears which moment it is now. */
  flipped: boolean;
  /**
   * "From X": the opener's param on the first page, the list's card data on
   * a flipped one (the full row only carries it for guests).
   */
  contributorName?: string;
  collectionId?: string;
  collectionRole?: string;
  scrollY: SharedValue<number>;
  flipX: SharedValue<number>;
  pageOpacity: SharedValue<number>;
  flipPan: PanGesture;
  closePan: PanGesture;
  /** The moment is gone (deleted, removed from the album). */
  onClose: () => void;
  /** The person went back (the back button, an error's Back). */
  onBack: () => void;
  onShown: (moment: PartialMoment) => void;
  flipActions: AccessibilityActionInfo[];
  onFlipAction: (e: AccessibilityActionEvent) => void;
}

function MomentPage({
  id,
  initial,
  flipped,
  contributorName,
  collectionId,
  collectionRole,
  scrollY,
  flipX,
  pageOpacity,
  flipPan,
  closePan,
  onClose,
  onBack,
  onShown,
  flipActions,
  onFlipAction,
}: MomentPageProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const { currentSong, isPlaying, playError, playFull, pause, resume, seekTo } = usePlayerControls();
  const playerActions = usePlayerActions();
  const theme = useTheme();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  // At the top the page doesn't bounce, so a pull down moves the overlay
  // (swipe down to close) instead of stretching the writing; anywhere else it
  // bounces as usual. Settled only when a drag or fling ends: flipping
  // `bounces` mid-bounce would snap the page.
  const [atTop, setAtTop] = useState(true);
  const atTopNow = useSharedValue(true);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
    onEndDrag: (e) => {
      const y = e.contentOffset.y;
      // Let go mid-bounce at the top: decided when the bounce settles.
      if (y < -0.5) return;
      const top = y <= TOP_SLOP;
      if (top !== atTopNow.get()) {
        atTopNow.set(top);
        runOnJS(setAtTop)(top);
      }
    },
    onMomentumEnd: (e) => {
      const top = e.contentOffset.y <= TOP_SLOP;
      if (top !== atTopNow.get()) {
        atTopNow.set(top);
        runOnJS(setAtTop)(top);
      }
    },
  });
  // The paper bar behind the status bar and buttons fades in as the hero
  // band scrolls off, so text never slides under the Dynamic Island and the
  // buttons never float over writing. The artwork's top edge reaches the bar
  // after ~36pt of scroll, so the bar is fully in by then.
  const topBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [12, 48], [0, 1], Extrapolation.CLAMP),
  }));
  // The flip moves the writing; the paper bar and the buttons stay put.
  const flipStyle = useAnimatedStyle(() => ({
    opacity: pageOpacity.get(),
    transform: [{ translateX: flipX.get() }],
  }));
  const [moment, setMoment] = useState<PartialMoment | null>(initial);
  // "ready" straight away when the card handed over the moment; otherwise
  // the skeleton shows until the first fetch, never a "not found" flash.
  const [screenState, setScreenState] = useState<ScreenState>(() => (moment ? "ready" : "loading"));
  const [error, setError] = useState("");
  // A background refresh failed: the moment on screen stays, with a banner.
  const [refreshError, setRefreshError] = useState("");
  // The "…" button's frame while the JS fallback menu is open (binaries
  // without the native MenuButton).
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const menuButtonRef = useRef<ViewInstance>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  // Album membership: the Add to album quick pick, where each tick applies
  // as it's tapped.
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [createAlbumVisible, setCreateAlbumVisible] = useState(false);
  const [allCollections, setAllCollections] = useState<Album[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  // memberIds is real (loaded at least once), not the empty default.
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionLoadError, setCollectionLoadError] = useState("");
  const [collectionError, setCollectionError] = useState("");
  // Albums with an add or remove in flight: a second tap waits for the first.
  const togglingRef = useRef(new Set<string>());
  const createAlbumAfterPicker = useRef(false);
  // Report's fallback when Mail can't open: the address to copy.
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [reportAddressCopied, setReportAddressCopied] = useState(false);

  // A handle on the ScrollView's own scroll gesture, so the overlay's pans
  // have a declared relation to it instead of leaving arbitration to emerge
  // from whichever recognizer happens to fire first. A plain ref would not
  // do: RNGH resolves relation refs through a `handlerTag` that RN's
  // ScrollView doesn't carry, so passing one silently registers nothing.
  //
  // Simultaneous with both, so the scroll is never cancelled while a pan is
  // still deciding: the pans fail fast on the wrong axis (FLIP_FAIL_Y, the
  // close's top-only rule) so an ambiguous drag resolves to a scroll. The
  // relations live here, on the page's side, not on the overlay's pans: RNGH
  // checks a simultaneous pair from either side, and the page's handlers are
  // new each flip while the overlay's stay attached, so declaring them on
  // the side that attaches last always sees the other's current tag.
  const scrollNativeGesture = useMemo(
    () => Gesture.Native().simultaneousWithExternalGesture(flipPan, closePan),
    [flipPan, closePan]
  );

  // The photo strip keeps its own horizontal drags: the flip waits for the
  // strip's scroll to fail, which it does at once on a vertical drag (it
  // can't scroll that way), and never does on a horizontal one.
  const stripNativeGesture = useMemo(
    () => Gesture.Native().blocksExternalGesture(flipPan),
    [flipPan]
  );

  // Written by PlaybackProgress, which owns the per-tick subscription, so the
  // seek gesture can read the bar width and duration without this screen
  // re-rendering. Shared values rather than refs: the gestures read them on
  // the UI thread, and the React Compiler can't optimize a screen whose
  // gestures read refs.
  const progressBarWidth = useSharedValue(1);
  const progressDuration = useSharedValue(0);

  const hasAutoPlayed = useRef(false);
  const momentRef = useRef(moment);
  const playerRef = useRef({ currentSong, isPlaying });
  // Latest values for the autoplay timer and focus refetch; synced in the
  // commit rather than during render.
  useLayoutEffect(() => {
    momentRef.current = moment;
    playerRef.current = { currentSong, isPlaying };
  }, [moment, currentSong, isPlaying]);
  useEffect(() => {
    if (hasAutoPlayed.current) return;
    const m = momentRef.current;
    if (!m?.songAppleMusicId && !m?.songSpotifyId) return;
    hasAutoPlayed.current = true;
    const timer = setTimeout(() => {
      const current = momentRef.current;
      if (!current?.songAppleMusicId && !current?.songSpotifyId) return;
      const momentSongId = current.songSpotifyId ?? current.songAppleMusicId;
      const { currentSong: cs, isPlaying: ip } = playerRef.current;
      const playingId = cs?.spotifyId ?? cs?.appleMusicId;
      if (playingId === momentSongId && ip) return;
      playFull(
        {
          id: momentSongId ?? "",
          title: current.songTitle,
          artistName: current.songArtist,
          albumName: current.songAlbumName ?? "",
          artworkUrl: current.songArtworkUrl,
          provider: current.songProvider ?? 'apple_music',
          appleMusicId: current.songAppleMusicId ?? null,
          spotifyId: current.songSpotifyId ?? null,
          durationMs: 0,
        },
        current.songPreviewUrl || undefined,
        partStartSeconds(current.songPartMs)
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [moment?.id]);

  // The overlay stops this moment's song on a flip; it needs the latest row.
  useEffect(() => {
    if (moment) onShown(moment);
  }, [moment, onShown]);

  // Flipped here: say which moment it is now (the focus was on the last one).
  const announcedRef = useRef(!flipped);
  useEffect(() => {
    if (announcedRef.current || !moment) return;
    announcedRef.current = true;
    AccessibilityInfo.announceForAccessibility(`${moment.songTitle}, ${moment.songArtist}`);
  }, [moment]);

  // Scrubbing. The seek fires on `.onStart` (activation), never `.onBegin`
  // (touch-down) — the old onBegin meant resting a finger anywhere in the 28pt
  // band around the 2px bar jumped playback, including on a drag that was only
  // passing through on its way to scrolling the page.
  //
  // The 2:1 ratio between the offsets is what separates a scrub from a scroll:
  // the seek only wins on drags within ~27° of horizontal, anything steeper
  // trips failOffsetY and goes back to the ScrollView. Both numbers are kept
  // small on purpose — activating at 12px lost a fast rightward flick to the
  // old swipe-right close (verified on device), so the seek claims the drag
  // well before the flip's 18pt is in reach, and blocks the flip and the
  // close outright: on the bar, a sideways drag is always a scrub.
  const seekPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-3, 3])
        .onStart((e) => { runOnJS(seekTo)(seekSeconds(e.x, progressBarWidth.get(), progressDuration.get())); })
        .onUpdate((e) => { runOnJS(seekTo)(seekSeconds(e.x, progressBarWidth.get(), progressDuration.get())); })
        .blocksExternalGesture(flipPan, closePan),
    [seekTo, progressBarWidth, progressDuration, flipPan, closePan]
  );

  // Tap-to-seek, which onBegin used to provide for free. A tap can't be
  // confused with a scroll: it needs the finger to lift within 250ms having
  // moved less than 10px.
  const seekTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .maxDistance(10)
        .onEnd((e, success) => {
          if (success) { runOnJS(seekTo)(seekSeconds(e.x, progressBarWidth.get(), progressDuration.get())); }
        }),
    [seekTo, progressBarWidth, progressDuration]
  );

  const seekGesture = useMemo(
    () => Gesture.Race(seekPanGesture, seekTapGesture),
    [seekPanGesture, seekTapGesture]
  );

  const lastFetchRef = useRef(0);
  // Set when this screen pushes the editor, so coming back shows the edit
  // without waiting out the cooldown.
  const refetchOnFocusRef = useRef(false);
  const openTrackedRef = useRef(false);

  // `blocking` swaps the screen for the skeleton (nothing to show yet). A
  // background refresh keeps the moment on screen, and a failure there is a
  // banner, not a full-screen error.
  const fetchMoment = useCallback(async (blocking: boolean) => {
    if (blocking) setScreenState("loading");
    setRefreshError("");
    const t0 = Date.now();
    // The shared view: someone else's moment (or one not on hand yet) comes
    // through get_moment_view, without its place, people or link token. The
    // viewer's own moment is re-read from the table as before.
    const own = !!userId && momentRef.current?.userId === userId;
    let data: Moment | null;
    try {
      data = await fetchMomentForViewer(id, userId, own);
    } catch (fetchError) {
      if (blocking) {
        setError(friendlyError(fetchError));
        setScreenState("error");
      } else {
        setRefreshError(friendlyError(fetchError));
      }
      return;
    }

    lastFetchRef.current = Date.now();
    if (!data) {
      setScreenState("not_found");
      return;
    }
    setMoment(data);
    setScreenState("ready");
    if (!openTrackedRef.current) {
      openTrackedRef.current = true;
      posthog?.capture("moment_detail_open", {
        had_preview: !blocking, // pre-populated from momentCache or the list
        via_flip: flipped,
        duration_ms: Date.now() - t0,
      });
    }
  }, [id, userId, posthog, flipped]);

  // Focus refetch per CLAUDE.md: only when there's nothing on screen, after an
  // edit, or once the data is stale. The first focus always fetches: a moment
  // handed over by a card has only the card columns.
  useFocusEffect(
    useCallback(() => {
      const due =
        momentRef.current === null ||
        refetchOnFocusRef.current ||
        Date.now() - lastFetchRef.current > STALE_TIME;
      if (!due) return;
      const task = runWhenIdle(() => {
        refetchOnFocusRef.current = false;
        void fetchMoment(momentRef.current === null);
      });
      return () => { task.cancel(); };
    }, [fetchMoment])
  );

  // Full-size photos for the hero and the viewer; the strip's small squares
  // use the thumbnails (full-size fallback for moments that predate them).
  // Linked photos (1.4) show their originals from Photos on this device.
  // What this viewer sees: someone else's linked videos are left out
  // entirely (they play only from the owner's Photos).
  const shown = useMemo(() => (moment ? withoutOthersVideos(moment, user?.id) : null), [moment, user?.id]);
  const storedPhotoUrls = useMemo(
    () => shown?.photoUrls.map(getPublicPhotoUrl) ?? [],
    [shown?.photoUrls]
  );
  const mediaSources = useMediaSources(storedPhotoUrls, shown?.mediaRefs, shown?.userId);

  // Memory widget (1.5): its tap opens /moment/<id>?film=1. Play the film
  // once, as soon as there's something to play (no photos: just the moment).
  // Only for the moment the link named, not one flipped to; the param is
  // dropped once used so flipping back doesn't replay it.
  const { id: linkedId, film: filmParam } = useLocalSearchParams<{ id: string; film?: string }>();
  const filmOpened = useRef(false);
  useEffect(() => {
    if (filmParam !== "1" || filmOpened.current || id !== linkedId) return;
    if (screenState !== "ready" || mediaSources.length === 0) return;
    // After the page's entry: a modal presented while this screen is still
    // being presented can be dropped.
    const t = setTimeout(() => {
      filmOpened.current = true;
      setViewerIndex(0);
      setViewerVisible(true);
      router.setParams({ film: undefined });
    }, 400);
    return () => clearTimeout(t);
  }, [filmParam, id, linkedId, screenState, mediaSources.length, router]);
  const photoUrls = useMemo(() => mediaSources.map((s) => s.uri), [mediaSources]);
  const stripUrls = useMemo(() => (shown ? momentCardImageUrls(shown) : []), [shown]);

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  // The JS fallback menu, for binaries without the native MenuButton.
  const openMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Anchored under the "…" itself, inside the safe area.
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  };

  const handleEdit = () => {
    Haptics.selectionAsync();
    if (moment) {
      refetchOnFocusRef.current = true;
      router.push(`/moment/edit/${moment.id}`);
    }
  };

  const loadCollections = async () => {
    if (!user) return;
    setCollectionLoading(true);
    setCollectionLoadError("");
    try {
      // Always fetch fresh. Membership comes from collection_moments: the
      // album list only knows the moment ids of albums the user owns, so a
      // joined album always looked unchecked.
      const [cols, containing] = await Promise.all([
        fetchAlbums(user.id),
        fetchAlbumIdsContainingMoment(id),
      ]);
      const listed = new Set(cols.map((c) => c.id));
      setAllCollections(cols);
      setMemberIds(containing.filter((cid) => listed.has(cid)));
      setMembershipLoaded(true);
    } catch (e) {
      // Not "No albums yet": that would read as an empty account.
      setCollectionLoadError(friendlyError(e));
    }
    setCollectionLoading(false);
  };

  const handleAddToCollection = () => {
    Haptics.selectionAsync();
    setCollectionModalVisible(true);
    setCollectionError("");
    void loadCollections();
  };

  // One tick, applied now (DESIGN.md: quick picks apply as you tap, so Done
  // only closes). The tick and the album's count move first; a failure puts
  // both back and says so at the top of the sheet.
  const setMembership = (albumId: string, member: boolean) => {
    setMemberIds((prev) =>
      member ? (prev.includes(albumId) ? prev : [...prev, albumId]) : prev.filter((cid) => cid !== albumId)
    );
    setAllCollections((prev) =>
      prev.map((c) =>
        c.id === albumId && c.momentCount !== undefined
          ? { ...c, momentCount: Math.max(0, c.momentCount + (member ? 1 : -1)) }
          : c
      )
    );
  };

  // `add` says which way; a plain tap flips the album's current tick.
  const setAlbumMember = async (album: Album, add: boolean) => {
    if (!user || togglingRef.current.has(album.id)) return;
    togglingRef.current.add(album.id);
    Haptics.selectionAsync();
    setCollectionError("");
    setMembership(album.id, add);
    let failed = false;
    let failure: unknown;
    try {
      if (add) {
        await addMomentToAlbum(album.id, id, user.id);
      } else {
        await removeMomentFromAlbum(album.id, id);
      }
    } catch (e) {
      failed = true;
      failure = e;
    }
    togglingRef.current.delete(album.id);
    if (failed) {
      setMembership(album.id, !add);
      setCollectionError(`Couldn't ${add ? "add to" : "remove from"} “${album.name}”. ${friendlyError(failure)}`);
      return;
    }
    invalidateMomentCaches(queryClient, user.id);
    invalidateAlbumCaches(queryClient, user.id, album.id);
  };

  const toggleAlbum = (album: Album) => {
    const isMember = memberIds.includes(album.id);
    void setAlbumMember(album, !isMember);
  };

  // New album from the quick pick: the picker closes, the New album sheet
  // opens once it's gone, and closing that (made or not) comes back here.
  const openCreateAlbum = () => {
    createAlbumAfterPicker.current = true;
    setCollectionModalVisible(false);
  };
  const onPickerClosed = () => {
    if (!createAlbumAfterPicker.current) return;
    createAlbumAfterPicker.current = false;
    setCreateAlbumVisible(true);
  };
  const closeCreateAlbum = () => setCreateAlbumVisible(false);
  const onCreateAlbumClosed = () => setCollectionModalVisible(true);

  // The new album arrives ticked: the moment is added to it straight away.
  const handleAlbumCreated = (album: Album) => {
    setAllCollections((prev) => [...prev, { ...album, momentCount: album.momentCount ?? 0 }]);
    void setAlbumMember(album, true);
  };

  const handleDelete = async () => {
    if (deleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const confirmed = await confirmSheet(DELETE_MOMENT_CONFIRM);
    if (!confirmed) return;
    setDeleting(true);
    // An album owner removing a guest's contribution: the server deletes the
    // guest's photos and the row together (the owner's session can do
    // neither for the photos). Never delete that row from here.
    const isGuestRemoval = !!moment?.guestUuid && moment.userId !== user?.id;
    const { error: deleteError } = isGuestRemoval
      ? await deleteGuestMoment(id)
      : await deleteMomentWithCleanup({
          id,
          photoUrls: moment?.photoUrls ?? [],
          photoThumbnails: moment?.photoThumbnails ?? [],
          voicePath: moment?.voicePath ?? null,
        });

    if (deleteError) {
      setDeleting(false);
      Alert.alert(DELETE_MOMENT_FAILED, friendlyError(deleteError));
      return;
    }

    // The moment is gone — its song shouldn't keep playing (or linger
    // paused in the mini player). The live song, not this render's: the
    // menu ran this handler from when it opened. With nothing loaded yet,
    // stop anyway: that cancels this screen's autoplay if it's still
    // waiting on Apple Music.
    if (moment) stopSongOfDeletedMoment(playerActions, moment, { orIdle: true });

    posthog.capture("moment_deleted", { song_title: moment?.songTitle ?? null, song_artist: moment?.songArtist ?? null });
    // Covers every album's detail and list too (the moment may be in any).
    invalidateMomentCaches(queryClient, user?.id);
    onClose();
  };

  const handleRemoveFromCollection = async () => {
    if (!collectionId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const confirmed = await confirmSheet(REMOVE_FROM_ALBUM_CONFIRM);
    if (!confirmed) return;
    setDeleting(true);
    const { error: removeError } = await supabase
      .from("collection_moments")
      .delete()
      .eq("collection_id", collectionId)
      .eq("moment_id", id);

    if (removeError) {
      setDeleting(false);
      Alert.alert(REMOVE_FROM_ALBUM_FAILED, friendlyError(removeError));
      return;
    }

    markTimelineStale();
    invalidateMomentCaches(queryClient, user?.id);
    invalidateAlbumCaches(queryClient, user?.id, collectionId);
    onClose();
  };

  // Moods as one sentence-case Meta line. Every mood shows here (the card caps
  // at three); a deleted custom mood is left out rather than shown as its id.
  const moodLine = moment ? moodWords(moment.moods, allMoods, Infinity) : "";

  const openShare = () => {
    if (!moment || !canPassOn(moment, user?.id)) return;
    Haptics.selectionAsync();
    setShareModalVisible(true);
    posthog.capture("moment_shared", { song_title: moment.songTitle, song_artist: moment.songArtist });
  };

  // Mail with the moment filled in; with no mail app, the same
  // copy-the-address sheet as Settings' "Share feedback" (lib/mail.ts).
  const reportMoment = async () => {
    if (!moment) return;
    Haptics.selectionAsync();
    const url = mailtoUrl(FEEDBACK_EMAIL, {
      subject: `Report: ${moment.songTitle} by ${moment.songArtist}`,
      body: `Please describe what you'd like to report about this moment:\n\n\n\n---\nMoment ID: ${moment.id}\nContributor: ${moment.contributorName ?? "unknown"}`,
    });
    if (await openMail(url)) return;
    setReportAddressCopied(false);
    setReportSheetVisible(true);
  };

  const copyReportAddress = async () => {
    try {
      await Clipboard.setStringAsync(FEEDBACK_EMAIL);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReportAddressCopied(true);
    } catch {
      // The address is on screen and selectable; nothing else to do.
    }
  };

  // The "…" menu: the native UIMenu (MenuButton, the same menu as a long-
  // pressed card), or MomentActionMenu on a binary without it. Either way a
  // row runs once the menu has closed, so the sheets and confirms these open
  // can present. Destructive rows (Remove from album, Delete) sit in their
  // own section; Report isn't one (it destroys nothing).
  // Built as one literal (not pushed into): the compiler can't tell a push
  // won't call the handlers it's given.
  const isOwnMoment = !!moment && moment.userId === user?.id;
  const canShare = canPassOn(moment, user?.id);
  const isGuest = !!moment?.guestUuid;
  const isCollectionOwner = collectionRole === "owner";
  // Taken out of the album it was opened from (with Add to album's ticks):
  // nothing left to remove.
  const inCollection = !!collectionId && !(membershipLoaded && !memberIds.includes(collectionId));
  const canDelete = isOwnMoment || (isGuest && isCollectionOwner);
  const canRemove = inCollection && (isOwnMoment || isCollectionOwner);
  // Report for non-own, non-guest moments (guests are managed by the owner directly)
  const canReport = !isOwnMoment && !isGuest;
  // No Share row: the glass Share button beside the "…" does that.
  const menuItems: MomentMenuItem[] = moment
    ? [
        ...(isOwnMoment
          ? ([
              { key: "edit", label: "Edit", icon: "pencil-outline", onPress: handleEdit },
              { key: "album", label: "Add to album", icon: "albums-outline", onPress: handleAddToCollection },
            ] satisfies MomentMenuItem[])
          : []),
        ...(canReport
          ? ([{ key: "report", label: "Report", icon: "flag-outline", onPress: () => void reportMoment() }] satisfies MomentMenuItem[])
          : []),
        ...(canRemove
          ? ([
              {
                key: "remove",
                label: "Remove from album",
                icon: "remove-circle-outline",
                destructive: true,
                onPress: () => void handleRemoveFromCollection(),
              },
            ] satisfies MomentMenuItem[])
          : []),
        ...(canDelete
          ? ([{ key: "delete", label: "Delete", icon: "trash-outline", destructive: true, onPress: () => void handleDelete() }] satisfies MomentMenuItem[])
          : []),
      ]
    : [];

  const hasPhotos = photoUrls.length > 0;

  // "Tuesday, Oct 14 · Morning · Lake Dillon". The year appears only when it
  // isn't this year: old memories need it, today's entries don't.
  const formatWhen = (dateStr: string | null, timeOfDay: string | null, location: string | null) => {
    const parts: string[] = [];
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      const sameYear = d.getFullYear() === new Date().getFullYear();
      parts.push(
        d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          ...(sameYear ? {} : { year: "numeric" }),
        })
      );
    }
    if (timeOfDay) parts.push(timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1));
    if (location) parts.push(location);
    return parts.join(" · ");
  };

  const withPeople = (people: string[]) =>
    people.length <= 1
      ? `With ${people[0]}`
      : `With ${people.slice(0, -1).join(", ")} and ${people[people.length - 1]}`;

  const momentSongId = moment?.songSpotifyId ?? moment?.songAppleMusicId;
  const playingSongId = currentSong?.spotifyId ?? currentSong?.appleMusicId;
  // Loaded (playing or paused) is what keeps the progress bar and resume; a
  // pause from the background used to drop both and restart the song.
  const action = playAction(momentSongId, playingSongId, isPlaying);
  const isCurrentSong = action !== "play";
  const playLabel = action === "pause" ? "Pause" : action === "resume" ? "Resume" : playError ? "Unavailable" : "Play";

  // Start (or resume) this moment's song: the Play button and the film share it.
  const startSong = () => {
    if (!moment) return;
    if (action === "resume") {
      resume();
      return;
    }
    playFull(
      {
        id: moment.songSpotifyId ?? moment.songAppleMusicId ?? "",
        title: moment.songTitle,
        artistName: moment.songArtist,
        albumName: moment.songAlbumName,
        artworkUrl: moment.songArtworkUrl,
        provider: moment.songProvider ?? "apple_music",
        appleMusicId: moment.songAppleMusicId ?? null,
        spotifyId: moment.songSpotifyId ?? null,
        durationMs: 0,
      },
      moment.songPreviewUrl || undefined,
      partStartSeconds(moment.songPartMs)
    );
  };

  return (
    <View style={styles.page}>
      {/* Phase 1: the blurred artwork lives in the hero band and scrolls away
          with it, so the writing always sits on solid paper. As the band
          leaves, a paper bar fades in behind the status bar and buttons. */}
      <Animated.View
        style={[styles.topBar, { height: insets.top + 56 }, topBarStyle]}
        pointerEvents="none"
      />

      {/* Glass nav — pinned above the scroll. box-none so the full-width strip
          itself is transparent to touches and only the two buttons capture
          them; as a plain View it was eating drags across the top of the page. */}
      <View style={[styles.glassNav, { top: insets.top + 6 }]} pointerEvents="box-none">
        {/* Glass discs: the filled-over-imagery case, one size for all three. */}
        <IconButton
          variant="glass"
          name="chevron-back"
          size={20}
          onPress={onBack}
          accessibilityLabel="Back"
          testID="moment-back"
        />
        {screenState === "ready" && moment && (
          <View style={styles.glassBtnRow}>
            {/* Only the owner can pass a moment on (link, card, send). */}
            {canShare ? (
              <IconButton
                variant="glass"
                name="share-outline"
                size={20}
                onPress={openShare}
                accessibilityLabel="Share"
                testID="moment-share"
              />
            ) : null}
            {MomentMenuButton ? (
              // The native button is what's tapped (and carries the testID);
              // the IconButton inside only draws the glass disc and takes no
              // touches, so its onPress never runs.
              <MomentMenuButton items={menuItems} testID="moment-more">
                <IconButton variant="glass" name="ellipsis-horizontal" size={20} onPress={openMenu} />
              </MomentMenuButton>
            ) : (
              <View ref={menuButtonRef} collapsable={false}>
                <IconButton
                  variant="glass"
                  name="ellipsis-horizontal"
                  size={20}
                  onPress={openMenu}
                  accessibilityLabel="More"
                  testID="moment-more"
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* The "…" fallback; stays closed when the native MenuButton is there. */}
      <MomentActionMenu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)} />

      <Animated.View style={[styles.flipLayer, flipStyle]}>
      {screenState === "loading" ? (
        <View style={styles.loadingContainer}>
          <SkeletonMomentDetail />
        </View>
      ) : screenState === "error" ? (
        <ErrorState
          message={error}
          onRetry={() => fetchMoment(true)}
          onBack={onBack}
        />
      ) : screenState === "not_found" || !moment ? (
        <ErrorState message="Moment not found" onBack={onBack} />
      ) : (
        // The hero lives INSIDE the scroll view. As a sibling above it, the top
        // ~280pt of the screen — photo, artwork, photo-count pill — was inert to
        // vertical drags, which is most of what "scrolling is hard" meant.
        <GestureDetector gesture={scrollNativeGesture}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          bounces={!atTop}
        >
          {/* Hero section */}
          {hasPhotos ? (
            <View style={[styles.photoHero, { height: insets.top + 380 }]}>
              {/* The photo prints clean: no gradient or caption over it. It
                  fades slowly through the moment's photos. */}
              <HeroPhotoCycle
                urls={photoUrls}
                onOpen={(i) => { setViewerIndex(i); setViewerVisible(true); }}
                counterStyle={styles.photoCounterPill}
                counterTextStyle={styles.photoCounterText}
              />
            </View>
          ) : (
            <View style={[styles.ambientHero, { paddingTop: insets.top + 56, height: insets.top + 360 }]}>
              {moment.songArtworkUrl ? (
                <>
                  <AppImage
                    source={{ uri: moment.songArtworkUrl }}
                    style={StyleSheet.absoluteFill}
                    blurRadius={50}
                    contentFit="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, styles.heroVeil]} />
                  <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkHero} contentFit="cover" />
                </>
              ) : (
                <ArtworkPlaceholder style={styles.artworkHero} />
              )}
            </View>
          )}

          <View style={styles.scrollBody}>
            {refreshError ? (
              <ErrorBanner
                message={refreshError}
                onRetry={() => fetchMoment(false)}
                onDismiss={() => setRefreshError("")}
              />
            ) : null}

            {/* With photos the song steps back to a compact row; without, the
                title leads. Title, artist and album each open their pages. */}
            <View style={hasPhotos ? styles.songRow : undefined}>
              {hasPhotos ? (
                moment.songArtworkUrl ? (
                  <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artworkThumb} contentFit="cover" />
                ) : (
                  <ArtworkPlaceholder style={styles.artworkThumb} />
                )
              ) : null}
              <View style={hasPhotos ? styles.songRowText : undefined}>
                <Text
                  style={[styles.songTitleHero, hasPhotos && styles.songTitleCompact]}
                  numberOfLines={2}
                  onPress={() => router.push({ pathname: "/song", params: { title: moment.songTitle, artist: moment.songArtist } })}
                  accessibilityRole="link"
                  accessibilityActions={flipActions.length > 0 ? flipActions : undefined}
                  onAccessibilityAction={flipActions.length > 0 ? onFlipAction : undefined}
                >
                  {moment.songTitle}
                </Text>
                <Text style={styles.artistLine} numberOfLines={2}>
                  <Text
                    onPress={() => router.push({ pathname: "/artist", params: { name: moment.songArtist } })}
                    accessibilityRole="link"
                  >
                    {moment.songArtist}
                  </Text>
                  {moment.songAlbumName ? (
                    <>
                      {" · "}
                      <Text
                        onPress={() => router.push({ pathname: "/album", params: { album: moment.songAlbumName, artist: moment.songArtist } })}
                        accessibilityRole="link"
                      >
                        {moment.songAlbumName}
                      </Text>
                    </>
                  ) : null}
                </Text>
              </View>
            </View>

            {/* When and where, as a quiet line under the song. */}
            {(moment.momentDate || moment.timeOfDay || moment.location) ? (
              <Text style={styles.whenLine}>
                {formatWhen(moment.momentDate, moment.timeOfDay ?? null, moment.location ?? null)}
              </Text>
            ) : null}

            {/* Player: one compact row. Seeking only while this song plays. */}
            {(moment.songAppleMusicId || moment.songSpotifyId) ? (
              <View style={styles.playerRow}>
                <TouchableOpacity
                  style={[styles.playButton, playError && styles.playButtonError]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={playLabel}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (action === "pause") {
                      pause();
                    } else {
                      startSong();
                    }
                  }}
                >
                  <Icon
                    name={action === "pause" ? "pause" : "play"}
                    size={18}
                    color={playError ? theme.colors.textTertiary : theme.colors.buttonText}
                  />
                </TouchableOpacity>
                <PlaybackProgress
                  isCurrentSong={!!isCurrentSong}
                  playError={!!playError}
                  seekGesture={seekGesture}
                  barWidth={progressBarWidth}
                  duration={progressDuration}
                  partMs={moment.songPartMs ?? null}
                  styles={styles}
                />
              </View>
            ) : null}

            {(contributorName || moment.contributorName) ? (
              <Text style={styles.contributor} numberOfLines={1}>
                From {contributorName || moment.contributorName}
              </Text>
            ) : null}

            {/* Blank lines become paragraph spacing, not empty 30pt lines. */}
            {moment.reflectionText ? (
              <View style={styles.reflectionBlock}>
                {moment.reflectionText
                  .split(/\n\s*\n/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <Text key={i} style={styles.reflection} selectable>{para}</Text>
                  ))}
              </View>
            ) : null}

            {/* The owner's voice recording. The shared view never carries
                it, and the owner check guards a cached row too. */}
            {isOwnMoment && moment.voicePath ? (
              <VoiceNoteRow path={moment.voicePath} durationMs={moment.voiceDurationMs ?? null} />
            ) : null}

            {/* Quiet metadata: people, moods as words, weather. */}
            {((moment.people?.length ?? 0) > 0 || !!moodLine || moment.weatherCondition) ? (
              <View style={styles.metaBlock}>
                {moment.people && moment.people.length > 0 ? (
                  <Text style={styles.metaLine}>{withPeople(moment.people)}</Text>
                ) : null}
                {moment.weatherCondition ? (
                  <Text style={styles.metaLine}>
                    {moment.weatherCondition}{moment.weatherTempF != null ? ` · ${moment.weatherTempF}°F` : ""}
                  </Text>
                ) : null}
                {moodLine ? <Text style={styles.moodWords}>{moodLine}</Text> : null}
              </View>
            ) : null}

            {/* All the photos: the hero fades through them; tap one here to open it. */}
            {hasPhotos && stripUrls.length > 1 ? (
              <GestureDetector gesture={stripNativeGesture}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStrip}
                contentContainerStyle={styles.photoStripContent}
              >
                {stripUrls.map((url, idx) => (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.85}
                    onPress={() => { setViewerIndex(idx); setViewerVisible(true); }}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Photo ${idx + 1} of ${stripUrls.length}`}
                  >
                    <AppImage source={{ uri: url }} style={styles.photoStripThumb} contentFit="cover" transition={200} />
                    {shown?.mediaRefs?.[idx]?.kind === "video" ? (
                      <View style={styles.videoBadge} pointerEvents="none">
                        {/* Play only where it can: a linked video plays from its owner's Photos. */}
                        <Icon
                          name={mediaSources[idx]?.fromLibrary ? "play" : "videocam-outline"}
                          size={10}
                          color={PAPER_ON_GLASS}
                        />
                        <Text style={styles.videoBadgeText}>{clipLength(shown?.mediaRefs?.[idx]?.durationMs)}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              </GestureDetector>
            ) : null}

            {moment.locationLat != null && moment.locationLng != null ? (
              <TouchableOpacity
                style={styles.miniMapContainer}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${moment.location ?? "this place"} in Maps`}
                onPress={() => {
                  const label = encodeURIComponent(moment.location ?? "");
                  Linking.openURL(`maps://?q=${label}&ll=${moment.locationLat},${moment.locationLng}`);
                }}
              >
                <MapView
                  style={StyleSheet.absoluteFill}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude: moment.locationLat,
                    longitude: moment.locationLng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  <Marker
                    coordinate={{ latitude: moment.locationLat, longitude: moment.locationLng }}
                    pinColor={theme.colors.accent}
                  />
                </MapView>
                <View style={styles.miniMapHint}>
                  <Icon name="map-outline" size={12} color={theme.colors.text} />
                  <Text style={styles.miniMapHintText}>Open in Maps</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.ScrollView>
        </GestureDetector>
      )}
      </Animated.View>

      {/* Photos and videos as a little film: swipe, zoom, play with the song. */}
      <MomentFilm
        items={mediaSources}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        songPlaying={action === "pause"}
        startSong={startSong}
        pauseSong={pause}
        ownMoment={!!moment && moment.userId === user?.id}
        voicePath={isOwnMoment ? moment?.voicePath ?? null : null}
        voiceDurationMs={moment?.voiceDurationMs ?? null}
      />

      {moment && canShare && (
        <ShareMomentSheet
          visible={shareModalVisible}
          moment={moment}
          photoUrls={photoUrls}
          onClose={() => setShareModalVisible(false)}
          onAddToAlbum={handleAddToCollection}
        />
      )}

      {/* Album membership: a quick pick, each tick applies as it's tapped. */}
      <AlbumPicker
        mode="multi"
        visible={collectionModalVisible}
        title="Add to album"
        collections={allCollections}
        selectedIds={memberIds}
        onToggle={toggleAlbum}
        onClose={() => setCollectionModalVisible(false)}
        onRequestCreate={openCreateAlbum}
        onClosed={onPickerClosed}
        error={collectionError}
        loading={collectionLoading}
        loadError={collectionLoadError}
        onRetry={loadCollections}
      />

      {user ? (
        <CreateAlbumSheet
          visible={createAlbumVisible}
          userId={user.id}
          defaultShared={false}
          onCreated={handleAlbumCreated}
          onClose={closeCreateAlbum}
          onClosed={onCreateAlbumClosed}
        />
      ) : null}

      <BottomSheet
        visible={reportSheetVisible}
        onClose={() => setReportSheetVisible(false)}
        title="Report"
      >
        <View style={styles.reportBody}>
          <Text style={styles.reportText}>{MAIL_UNAVAILABLE_TEXT}</Text>
          <Text style={styles.reportAddress} selectable>
            {FEEDBACK_EMAIL}
          </Text>
          {moment ? (
            <Text style={styles.reportText}>
              Say which moment: “{moment.songTitle}” by {moment.songArtist}.
            </Text>
          ) : null}
          <Button
            label={reportAddressCopied ? "Copied" : "Copy address"}
            icon={reportAddressCopied ? "checkmark" : "copy-outline"}
            onPress={copyReportAddress}
            style={styles.reportCopy}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

/**
 * The progress bar and time label. Only this subscribes to playback progress,
 * so the rest of the detail screen doesn't re-render on every tick.
 */
function PlaybackProgress({
  isCurrentSong,
  playError,
  seekGesture,
  barWidth,
  duration,
  partMs,
  styles,
}: {
  isCurrentSong: boolean;
  playError: boolean;
  seekGesture: ReturnType<typeof Gesture.Race>;
  barWidth: SharedValue<number>;
  duration: SharedValue<number>;
  /** The part of the song (lib/songPart.ts): marked on the bar, named before play. */
  partMs: number | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const { playbackTime, playbackDuration } = usePlayerProgress();
  useEffect(() => {
    duration.set(playbackDuration);
  }, [duration, playbackDuration]);

  const partStart = partStartSeconds(partMs);
  if (!isCurrentSong || playbackDuration <= 0) {
    return (
      <Text style={styles.playHint}>
        {playError ? "Unavailable" : partStart != null ? `Play from ${formatSongTime(partStart * 1000)}` : "Play"}
      </Text>
    );
  }
  // A preview is its own 30 s clip, so the part can't be placed on it.
  const mark = playbackDuration > 40 ? partFraction(partMs, playbackDuration * 1000) : null;
  return (
    <>
      <GestureDetector gesture={seekGesture}>
        <View
          style={styles.progressTrackWrapper}
          onLayout={(e) => { barWidth.set(e.nativeEvent.layout.width); }}
        >
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (playbackTime / playbackDuration) * 100)}%` }]} />
          </View>
          {mark != null ? (
            <View
              style={[styles.partMark, { left: `${mark * 100}%` }]}
              accessibilityLabel={`The part of the song, at ${formatSongTime((partMs ?? 0))}`}
            />
          ) : null}
        </View>
      </GestureDetector>
      <Text style={styles.progressTime}>
        {formatTime(playbackTime)} / {formatTime(playbackDuration)}
      </Text>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      // Clips to the rounded corners while it's pulled down to close.
      overflow: "hidden",
    },
    page: {
      flex: 1,
    },
    flipLayer: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    // ── Top bar + buttons ────────────────────────────────────────────────────
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    glassNav: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      zIndex: 10,
    },
    glassBtnRow: {
      flexDirection: "row",
      gap: 8,
    },
    // ── Hero ─────────────────────────────────────────────────────────────────
    photoHero: {
      flexShrink: 0,
    },
    videoBadge: {
      position: "absolute",
      left: 4,
      bottom: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: theme.radii.full,
      backgroundColor: INK_GLASS,
    },
    videoBadgeText: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      color: PAPER_ON_GLASS,
    },
    photoCounterPill: {
      position: "absolute",
      bottom: 14,
      right: 14,
      backgroundColor: INK_GLASS,
      borderRadius: theme.radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    photoCounterText: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
      color: PAPER_ON_GLASS,
    },
    ambientHero: {
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    heroVeil: {
      backgroundColor: theme.colors.artVeil,
    },
    artworkHero: {
      width: 232,
      height: 232,
      borderRadius: theme.radii.md,
      // Artwork lift (DESIGN.md, Shadow Vocabulary).
      ...theme.shadows.artworkLift,
    },
    // ── Scroll body ──────────────────────────────────────────────────────────
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 80,
    },
    scrollBody: {
      paddingHorizontal: 24,
      paddingTop: 24,
      backgroundColor: theme.colors.background,
    },
    whenLine: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 10,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 4,
    },
    songRowText: {
      flex: 1,
      minWidth: 0,
    },
    artworkThumb: {
      width: 64,
      height: 64,
      borderRadius: 10,
    },
    songTitleHero: {
      ...theme.typography.headline,
      color: theme.colors.text,
    },
    songTitleCompact: {
      fontSize: 26,
      lineHeight: 30,
    },
    artistLine: {
      fontSize: 15,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 6,
    },
    playerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 18,
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: 999,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    playButtonError: {
      backgroundColor: theme.colors.fill,
    },
    playHint: {
      fontSize: 14,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    progressTrackWrapper: {
      flex: 1,
      height: 28,
      justifyContent: "center",
    },
    // The part of the song: a short tick through the bar, in ink.
    partMark: {
      position: "absolute",
      width: 2,
      height: 11,
      marginLeft: -1,
      top: 8.5,
      borderRadius: 1,
      backgroundColor: theme.colors.text,
    },
    progressTrack: {
      height: 3,
      backgroundColor: theme.colors.divider,
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: 3,
      backgroundColor: theme.colors.text,
      borderRadius: 2,
    },
    progressTime: {
      fontSize: 13,
      fontFamily: theme.fonts.body,
      fontVariant: ["tabular-nums"],
      color: theme.colors.textSecondary,
    },
    contributor: {
      fontSize: 14,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      marginTop: 16,
    },
    // ── Reflection: the user's words, set to be read ─────────────────────────
    reflectionBlock: {
      marginTop: 26,
      gap: 16,
    },
    reflection: {
      fontFamily: theme.fonts.reading,
      fontSize: 19,
      lineHeight: 30,
      color: theme.colors.text,
    },
    metaBlock: {
      marginTop: 22,
      gap: 6,
    },
    metaLine: {
      fontSize: 14,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    // Moods are words: Meta, sentence case, Umber Gray.
    moodWords: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    photoStrip: {
      marginTop: 22,
      marginHorizontal: -24,
    },
    photoStripContent: {
      paddingHorizontal: 24,
      gap: 8,
    },
    photoStripThumb: {
      width: 96,
      height: 96,
      borderRadius: 10,
    },
    // ── Mini map ─────────────────────────────────────────────────────────────
    miniMapContainer: {
      height: 140,
      borderRadius: 12,
      overflow: "hidden",
      marginTop: 22,
    },
    miniMapHint: {
      position: "absolute",
      bottom: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: theme.colors.elevated,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    miniMapHintText: {
      fontSize: 12,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    // ── Report fallback sheet (as Settings' Share feedback) ───────────────
    reportBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    reportText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    reportAddress: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.lg,
      color: theme.colors.text,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    reportCopy: {
      marginTop: theme.spacing.xl,
    },
  });
}

