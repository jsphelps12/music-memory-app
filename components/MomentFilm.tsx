import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import type { MediaSource } from "@/lib/linkedMedia";
import { videoFile } from "@/modules/now-playing";

/** In the film, how long a photo holds before the next fades in. */
const PHOTO_MS = 4000;
/** The cross-fade between one photo or video and the next. */
const FADE_MS = 700;
/** The slow drift on a photo while the film plays. */
const DRIFT_SCALE = 1.06;
/** Drag down this far to close. */
const CLOSE_DRAG = 120;

// Controls float over photos and video: warm-ink glass, paper glyphs, the
// same in both themes (as PhotoViewer).
const INK_GLASS = "rgba(35,34,43,0.55)";
const PAPER_ON_GLASS = "#FBF7F2";
// Night, the second material (DESIGN.md): media sits on it in both themes.
const NIGHT = "#0E0B0A";

type Styles = ReturnType<typeof createStyles>;

/**
 * A moment's photos and videos as a little film (1.4, Josh's call). It
 * plays as soon as it opens: the song starts, photos drift for a few seconds
 * each, videos play through, and each fades into the next, looping. Tap the
 * right side for the next, the left for the previous; Pause stops it and
 * gives a swipeable, zoomable pager. Videos play muted; the speaker brings
 * their sound up while the song ducks (lib/audioMix.ts). Story-style
 * segments show where you are. Drag down or ✕ to close. Nothing is exported.
 */
export function MomentFilm({
  items,
  initialIndex,
  visible,
  onClose,
  songPlaying,
  startSong,
  pauseSong,
}: {
  items: MediaSource[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  songPlaying: boolean;
  startSong: () => void;
  pauseSong: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { duck } = usePlayerControls();
  const [index, setIndex] = useState(initialIndex);
  const [film, setFilm] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const listRef = useRef<FlatList<MediaSource>>(null);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const count = items.length;
  const current = items[index];

  const setClipSound = useCallback(
    (on: boolean) => {
      setSoundOn(on);
      duck(on);
    },
    [duck]
  );

  const show = useCallback(
    (i: number) => {
      if (count === 0) return;
      const target = ((i % count) + count) % count;
      setIndex(target);
      if (!film) listRef.current?.scrollToIndex({ index: target, animated: true });
    },
    [count, film]
  );
  const next = useCallback(() => show(index + 1), [index, show]);
  const prev = useCallback(() => show(index - 1), [index, show]);

  // A new item: the clip's sound goes off, its segment starts from zero.
  useEffect(() => {
    if (soundOn) setClipSound(false);
    cancelAnimation(progress);
    progress.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // The film: a photo holds PHOTO_MS, then the next fades in; videos move on
  // when they end (VideoPage). A plain timer, cleared on any change.
  useEffect(() => {
    if (!visible || !film || !current || current.kind !== "photo" || count < 2) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: PHOTO_MS, easing: Easing.linear });
    const timer = setTimeout(next, PHOTO_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [visible, film, current, count, next, progress]);

  const close = useCallback(() => {
    if (soundOn) setClipSound(false);
    setFilm(false);
    onClose();
  }, [onClose, setClipSound, soundOn]);

  const playFilm = useCallback(() => {
    if (!songPlaying) startSong();
    setFilm(true);
  }, [songPlaying, startSong]);

  const pauseFilm = useCallback(() => {
    setFilm(false);
    if (songPlaying) pauseSong();
    // Hand over to the pager at the same item.
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 0);
  }, [index, pauseSong, songPlaying]);

  // Opening starts the film (more than one item) with the song.
  const onOpen = () => {
    setIndex(initialIndex);
    dragY.value = 0;
    if (count > 1) playFilm();
    else setFilm(false);
    setTimeout(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 50);
  };

  const tap = (x: number) => {
    Haptics.selectionAsync();
    if (x < width / 3) prev();
    else next();
  };

  // Drag down to close; a tap moves on (right) or back (left).
  const closeGesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DRAG) runOnJS(close)();
      else dragY.value = withTiming(0, { duration: 200 });
    });
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e, success) => {
      if (success) runOnJS(tap)(e.x);
    });
  const gestures = Gesture.Race(closeGesture, tapGesture);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.min(dragY.value / (CLOSE_DRAG * 3), 0.5),
  }));

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onShow={onOpen} onRequestClose={close}>
      <GestureDetector gesture={gestures}>
        <Animated.View style={[styles.screen, sheetStyle]}>
          {/* Paused: a pager to swipe and zoom. Kept mounted under the film. */}
          <View style={StyleSheet.absoluteFill} pointerEvents={film ? "none" : "auto"}>
            <FlatList
              ref={listRef}
              data={items}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, i) => `${i}:${item.uri}`}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              initialScrollIndex={initialIndex < count ? initialIndex : 0}
              onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item, index: i }) =>
                item.kind === "video" ? (
                  <VideoPage
                    item={item}
                    width={width}
                    height={height}
                    active={visible && !film && i === index}
                    looping
                    muted={!soundOn}
                    progress={progress}
                    onEnded={() => {}}
                    styles={styles}
                  />
                ) : (
                  <PhotoPage uri={item.uri} width={width} height={height} drifting={false} zoomable />
                )
              }
            />
          </View>

          {/* Playing: each item fades in over the last. */}
          {film && current ? (
            <FilmStage
              items={items}
              index={index}
              width={width}
              height={height}
              muted={!soundOn}
              progress={progress}
              onVideoEnded={next}
              styles={styles}
            />
          ) : null}

        </Animated.View>
      </GestureDetector>

      {/* Controls sit outside the gesture area, so a tap on them is only theirs. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Where you are: one segment per photo or video. */}
        <View style={[styles.segments, { top: insets.top + 10 }]} pointerEvents="none">
          {items.map((_, i) => (
            <Segment key={i} state={i < index ? "done" : i === index ? "now" : "next"} progress={progress} styles={styles} />
          ))}
        </View>

        <TouchableOpacity
          onPress={close}
          style={[styles.glassButton, styles.close, { top: insets.top + 24 }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={22} color={PAPER_ON_GLASS} />
        </TouchableOpacity>

        <View style={[styles.bottom, { bottom: insets.bottom + 24 }]}>
          {count > 1 ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                if (film) pauseFilm();
                else playFilm();
              }}
              style={[styles.glassButton, styles.pill]}
              accessibilityRole="button"
              accessibilityLabel={film ? "Pause" : "Play as a film with the song"}
            >
              <Icon name={film ? "pause" : "play"} size={18} color={PAPER_ON_GLASS} />
              <Text style={styles.pillText}>{film ? "Pause" : "Play"}</Text>
            </TouchableOpacity>
          ) : null}
          {current?.kind === "video" && current.fromLibrary ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setClipSound(!soundOn);
              }}
              style={[styles.glassButton, styles.round]}
              accessibilityRole="button"
              accessibilityLabel={soundOn ? "Mute the clip" : "Hear the clip"}
            >
              <Icon name={soundOn ? "volume-high-outline" : "volume-mute-outline"} size={20} color={PAPER_ON_GLASS} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The film: the current item on top of the one before, fading in over
 * FADE_MS. Only the current item plays; the one beneath is a still.
 */
function FilmStage({
  items,
  index,
  width,
  height,
  muted,
  progress,
  onVideoEnded,
  styles,
}: {
  items: MediaSource[];
  index: number;
  width: number;
  height: number;
  muted: boolean;
  progress: SharedValue<number>;
  onVideoEnded: () => void;
  styles: Styles;
}) {
  const reduceMotion = useReducedMotion();
  const [under, setUnder] = useState<number | null>(null);
  const shown = useRef(index);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (shown.current === index) return;
    setUnder(shown.current);
    shown.current = index;
    fade.value = 0;
    fade.value = withTiming(1, { duration: reduceMotion ? 0 : FADE_MS, easing: Easing.out(Easing.quad) }, (done) => {
      if (done) runOnJS(setUnder)(null);
    });
  }, [index, fade, reduceMotion]);

  const topStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const item = items[index];
  const below = under !== null ? items[under] : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {below ? (
        <View style={StyleSheet.absoluteFill}>
          <AppImage source={{ uri: below.uri }} style={{ width, height }} contentFit="contain" />
        </View>
      ) : null}
      <Animated.View key={index} style={[StyleSheet.absoluteFill, styles.night, topStyle]}>
        {item.kind === "video" ? (
          <VideoPage
            item={item}
            width={width}
            height={height}
            active
            looping={false}
            muted={muted}
            progress={progress}
            onEnded={onVideoEnded}
            styles={styles}
          />
        ) : (
          <PhotoPage uri={item.uri} width={width} height={height} drifting={!reduceMotion} zoomable={false} />
        )}
      </Animated.View>
    </View>
  );
}

function Segment({ state, progress, styles }: { state: "done" | "now" | "next"; progress: SharedValue<number>; styles: Styles }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === "done" ? 1 : state === "now" ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fill]} />
    </View>
  );
}

function PhotoPage({
  uri,
  width,
  height,
  drifting,
  zoomable,
}: {
  uri: string;
  width: number;
  height: number;
  drifting: boolean;
  zoomable: boolean;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (drifting) {
      scale.value = 1;
      scale.value = withTiming(DRIFT_SCALE, { duration: PHOTO_MS + FADE_MS, easing: Easing.out(Easing.quad) });
    } else {
      scale.value = 1;
    }
  }, [drifting, scale]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const image = (
    <Animated.View style={[{ width, height }, drift]}>
      <AppImage source={{ uri }} style={{ width, height }} contentFit="contain" transition={200} />
    </Animated.View>
  );
  if (!zoomable) return image;
  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={{ width, height, alignItems: "center", justifyContent: "center" }}
      maximumZoomScale={3}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
    >
      {image}
    </ScrollView>
  );
}

function VideoPage({
  item,
  width,
  height,
  active,
  looping,
  muted,
  progress,
  onEnded,
  styles,
}: {
  item: MediaSource;
  width: number;
  height: number;
  active: boolean;
  looping: boolean;
  muted: boolean;
  progress: SharedValue<number>;
  onEnded: () => void;
  styles: Styles;
}) {
  // A linked video plays from a copy inside the app (the library's own file
  // is outside the sandbox), made on demand and downloaded from iCloud if
  // needed. Elsewhere only its poster exists.
  const localId = item.fromLibrary && item.uri.startsWith("ph://") ? item.uri.slice(5) : null;
  const [file, setFile] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !localId || file) return;
    let cancelled = false;
    void videoFile(localId).then((uri) => {
      if (cancelled) return;
      if (uri) setFile(uri);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, localId, file]);

  const player = useVideoPlayer(file, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (!file) return;
    if (active) player.play();
    else {
      player.pause();
      player.currentTime = 0;
    }
  }, [active, file, player]);

  useEffect(() => {
    const ended = player.addListener("playToEnd", () => {
      if (looping) {
        player.currentTime = 0;
        player.play();
      } else {
        onEnded();
      }
    });
    const tick = player.addListener("timeUpdate", ({ currentTime }) => {
      if (active && player.duration > 0) progress.value = Math.min(1, currentTime / player.duration);
    });
    return () => {
      ended.remove();
      tick.remove();
    };
  }, [player, looping, onEnded, active, progress]);

  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {file ? (
        <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} />
      ) : (
        <View style={{ width, height }}>
          <AppImage source={{ uri: item.uri }} style={{ width, height }} contentFit="contain" />
          <View style={styles.videoNote} pointerEvents="none">
            {localId && !failed ? (
              active ? <ActivityIndicator color={PAPER_ON_GLASS} /> : null
            ) : (
              <Text style={styles.videoNoteText}>
                {failed ? "This video couldn't be loaded from Photos" : "Plays on the phone it came from"}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: NIGHT },
    night: { backgroundColor: NIGHT },
    segments: {
      position: "absolute",
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      flexDirection: "row",
      gap: 4,
    },
    segment: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: "rgba(251,247,242,0.3)",
      overflow: "hidden",
    },
    segmentFill: { height: 2, backgroundColor: PAPER_ON_GLASS },
    glassButton: {
      backgroundColor: INK_GLASS,
      alignItems: "center",
      justifyContent: "center",
    },
    close: {
      position: "absolute",
      right: theme.spacing.lg,
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    bottom: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.md,
    },
    pill: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      height: 44,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: 22,
    },
    pillText: { ...theme.typography.bodyStrong, color: PAPER_ON_GLASS },
    round: { width: 44, height: 44, borderRadius: 22 },
    videoNote: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
    },
    videoNoteText: {
      ...theme.typography.meta,
      color: PAPER_ON_GLASS,
      backgroundColor: INK_GLASS,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.full,
      overflow: "hidden",
    },
  });
}
