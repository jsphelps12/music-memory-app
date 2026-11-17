import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
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
import { PhotosVideoView, setDuckOthers } from "@/modules/photos-video";
import { CLIP_LEVEL } from "@/lib/audioMix";

/** How long a photo holds before the next fades in. */
const PHOTO_MS = 4000;
/** The cross-fade between one photo or video and the next. */
const FADE_MS = 700;
/** Drag down this far to close; sideways this far to move on or back. */
const CLOSE_DRAG = 120;
const SWIPE = 50;

// Controls float over photos and video: warm-ink glass, paper glyphs, the
// same in both themes (as PhotoViewer).
const INK_GLASS = "rgba(35,34,43,0.55)";
const PAPER_ON_GLASS = "#FBF7F2";
// Night, the second material (DESIGN.md): media sits on it in both themes.
const NIGHT = "#0E0B0A";

type Styles = ReturnType<typeof createStyles>;

/**
 * A moment's photos and videos as a little film (1.4, Josh's call). One
 * stage, playing or paused. It plays as soon as it opens: the song starts,
 * photos hold for a few seconds (still, no zoom), videos play through, and
 * each fades into the next, looping. Pause freezes everything where it is
 * (the photo's timer, the video, the song); Play carries on from there. Tap
 * or swipe right/left for next/previous; drag down or ✕ to close.
 *
 * Sound: clips play muted. The speaker brings a clip's sound up to 80%; a
 * preview song fades to 20% under it (lib/audioMix.ts), and full Apple Music
 * playback is ducked by iOS (the app asks for "duck others" while the clip
 * is heard). If iOS refuses, the song pauses for the clip and says so, and
 * comes back when the clip's sound goes off (unless the film is paused).
 * Nothing is exported.
 */
export function MomentFilm({
  items,
  initialIndex,
  visible,
  onClose,
  songPlaying,
  startSong,
  pauseSong,
  ownMoment = true,
}: {
  items: MediaSource[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  songPlaying: boolean;
  startSong: () => void;
  pauseSong: () => void;
  /** Someone else's moment: its linked videos stay in their Photos, not here. */
  ownMoment?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { duck, isPreview } = usePlayerControls();
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  // Full playback paused for a clip's sound (Apple's player can't duck).
  const [songHeldForClip, setSongHeldForClip] = useState(false);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const count = items.length;
  const current = items[index];
  const filmLike = count > 1;

  // ── Clip sound and the song ────────────────────────────────────────────
  const clipSoundOff = useCallback(
    (resumeSong: boolean) => {
      setSoundOn(false);
      if (isPreview) duck(false);
      else setDuckOthers(false);
      if (songHeldForClip) {
        setSongHeldForClip(false);
        if (resumeSong) startSong();
      }
    },
    [duck, isPreview, songHeldForClip, startSong]
  );

  const toggleClipSound = () => {
    Haptics.selectionAsync();
    if (soundOn) {
      clipSoundOff(!paused);
      return;
    }
    setSoundOn(true);
    if (isPreview) duck(true);
    else if (songPlaying && setDuckOthers(true)) {
      // Full Apple Music: iOS ducks it (verified on Josh's phone, 2026-11-17).
    } else if (songPlaying) {
      // The session refused to duck: pause the song for the clip instead.
      pauseSong();
      setSongHeldForClip(true);
    }
  };

  // ── Moving between items ───────────────────────────────────────────────
  const show = useCallback(
    (i: number) => {
      if (count === 0) return;
      setIndex(((i % count) + count) % count);
    },
    [count]
  );
  const next = useCallback(() => show(index + 1), [index, show]);
  const prev = useCallback(() => show(index - 1), [index, show]);

  // A new item: its segment starts from zero (before the photo timer below
  // reads it), and a clip's sound goes off.
  useLayoutEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
  }, [index, progress]);
  useEffect(() => {
    if (soundOn) clipSoundOff(!paused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // A photo holds for the rest of PHOTO_MS, then the next fades in. Pausing
  // clears the timer and freezes the segment where it is.
  useEffect(() => {
    if (!visible || paused || !filmLike || !current || current.kind !== "photo") return;
    const remaining = Math.max(50, PHOTO_MS * (1 - progress.value));
    progress.value = withTiming(1, { duration: remaining, easing: Easing.linear });
    const timer = setTimeout(next, remaining);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [visible, paused, filmLike, current, index, next, progress]);

  // ── Play, pause, open, close ───────────────────────────────────────────
  const play = () => {
    Haptics.selectionAsync();
    setPaused(false);
    if (!songPlaying && !songHeldForClip) startSong();
  };
  const pause = () => {
    Haptics.selectionAsync();
    setPaused(true);
    if (songPlaying) pauseSong();
  };

  const onOpen = () => {
    setIndex(initialIndex);
    progress.value = 0;
    dragY.value = 0;
    setPaused(false);
    setSoundOn(false);
    setSongHeldForClip(false);
    if (filmLike && !songPlaying) startSong();
  };

  const close = useCallback(() => {
    if (soundOn) clipSoundOff(false);
    onClose();
  }, [clipSoundOff, onClose, soundOn]);

  // ── Gestures: drag down closes; swipe or tap moves ─────────────────────
  const tap = (x: number) => {
    Haptics.selectionAsync();
    if (x < width / 3) prev();
    else next();
  };
  const closePan = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DRAG) runOnJS(close)();
      else dragY.value = withTiming(0, { duration: 200 });
    });
  const swipePan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -SWIPE) runOnJS(next)();
      else if (e.translationX > SWIPE) runOnJS(prev)();
    });
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e, success) => {
      if (success) runOnJS(tap)(e.x);
    });
  const gestures = Gesture.Race(closePan, swipePan, tapGesture);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.min(dragY.value / (CLOSE_DRAG * 3), 0.5),
  }));

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onShow={onOpen} onRequestClose={close}>
      <GestureDetector gesture={gestures}>
        <Animated.View style={[styles.screen, sheetStyle]}>
          {current ? (
            <Stage
              items={items}
              index={index}
              width={width}
              height={height}
              playing={visible && !paused}
              loopVideo={!filmLike}
              muted={!soundOn}
              progress={progress}
              onVideoEnded={next}
              unplayableNote={
                ownMoment ? "Plays on the phone it came from" : "This video stays in its owner's Photos"
              }
              styles={styles}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>

      {/* Controls sit outside the gesture area, so a tap on them is only theirs. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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

        <View style={[styles.bottom, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
          {soundOn && songHeldForClip ? <Text style={styles.hint}>Song paused for the clip</Text> : null}
          <View style={styles.bottomRow}>
            {filmLike || current?.kind === "video" ? (
              <TouchableOpacity
                onPress={paused ? play : pause}
                style={[styles.glassButton, styles.pill]}
                accessibilityRole="button"
                accessibilityLabel={paused ? "Play" : "Pause"}
              >
                <Icon name={paused ? "play" : "pause"} size={18} color={PAPER_ON_GLASS} />
                <Text style={styles.pillText}>{paused ? "Play" : "Pause"}</Text>
              </TouchableOpacity>
            ) : null}
            {current?.kind === "video" && current.fromLibrary ? (
              <TouchableOpacity
                onPress={toggleClipSound}
                style={[styles.glassButton, styles.round]}
                accessibilityRole="button"
                accessibilityLabel={soundOn ? "Mute the clip" : "Hear the clip"}
              >
                <Icon name={soundOn ? "volume-high-outline" : "volume-mute-outline"} size={20} color={PAPER_ON_GLASS} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The current item over the one before it, fading in over FADE_MS.
 *
 * Each item is its own layer, keyed by its index, so a layer is never
 * remounted as it changes role: the outgoing item stays exactly as it was
 * (a video keeps its last frame) while the new one fades in on top. The items
 * either side are mounted too, invisible, so their pictures are decoded (and
 * a linked video's player loaded) before they're needed. The fade waits for
 * the new item's picture, up to FADE_WAIT_MS, so it never dips to black and
 * then pops.
 */
const FADE_WAIT_MS = 600;

function Stage({
  items,
  index,
  width,
  height,
  playing,
  loopVideo,
  muted,
  progress,
  onVideoEnded,
  unplayableNote,
  styles,
}: {
  items: MediaSource[];
  index: number;
  width: number;
  height: number;
  playing: boolean;
  loopVideo: boolean;
  muted: boolean;
  progress: SharedValue<number>;
  onVideoEnded: () => void;
  unplayableNote: string;
  styles: Styles;
}) {
  const reduceMotion = useReducedMotion();
  const [under, setUnder] = useState<number | null>(null);
  const shown = useRef(index);
  const loaded = useRef(new Set<number>());
  const pendingFade = useRef<number | null>(null);
  const fade = useSharedValue(1);

  const startFade = useCallback(() => {
    pendingFade.current = null;
    fade.value = withTiming(1, { duration: reduceMotion ? 0 : FADE_MS, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(setUnder)(null);
    });
  }, [fade, reduceMotion]);

  useEffect(() => {
    if (shown.current === index) return;
    setUnder(shown.current);
    shown.current = index;
    cancelAnimation(fade);
    fade.value = 0;
    if (loaded.current.has(index)) {
      startFade();
      return;
    }
    // Not decoded yet: fade as soon as it is, or after a short wait anyway.
    pendingFade.current = index;
    const timer = setTimeout(() => {
      if (pendingFade.current === index) startFade();
    }, FADE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [index, fade, startFade]);

  const onLoaded = useCallback(
    (i: number) => {
      loaded.current.add(i);
      if (pendingFade.current === i) startFade();
    },
    [startFade]
  );

  const count = items.length;
  const layers = new Set<number>([index]);
  if (count > 1) {
    layers.add((index + 1) % count);
    layers.add((index - 1 + count) % count);
  }
  if (under !== null) layers.add(under);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[...layers].map((i) => {
        const role = i === index ? "top" : i === under ? "under" : "ahead";
        return (
          <Layer
            key={i}
            item={items[i]}
            index={i}
            role={role}
            fade={fade}
            width={width}
            height={height}
            playing={role === "top" && playing}
            loopVideo={loopVideo}
            muted={role === "top" ? muted : true}
            progress={progress}
            onVideoEnded={onVideoEnded}
            onLoaded={onLoaded}
            unplayableNote={unplayableNote}
            styles={styles}
          />
        );
      })}
    </View>
  );
}

/** One item of the film; its role decides whether it shows and which way up. */
function Layer({
  item,
  index,
  role,
  fade,
  width,
  height,
  playing,
  loopVideo,
  muted,
  progress,
  onVideoEnded,
  onLoaded,
  unplayableNote,
  styles,
}: {
  item: MediaSource;
  index: number;
  role: "top" | "under" | "ahead";
  fade: SharedValue<number>;
  width: number;
  height: number;
  playing: boolean;
  loopVideo: boolean;
  muted: boolean;
  progress: SharedValue<number>;
  onVideoEnded: () => void;
  onLoaded: (index: number) => void;
  unplayableNote: string;
  styles: Styles;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: role === "top" ? fade.value : role === "under" ? 1 : 0,
    zIndex: role === "top" ? 2 : role === "under" ? 1 : 0,
  }));
  const loaded = () => onLoaded(index);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.night, style]}>
      {item.kind === "video" ? (
        <VideoPage
          item={item}
          width={width}
          height={height}
          active={role === "top"}
          playing={playing}
          loop={loopVideo}
          muted={muted}
          progress={progress}
          onEnded={onVideoEnded}
          onPosterLoaded={loaded}
          unplayableNote={unplayableNote}
          styles={styles}
        />
      ) : (
        <AppImage source={{ uri: item.uri }} style={{ width, height }} contentFit="contain" onLoad={loaded} />
      )}
    </Animated.View>
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

function VideoPage({
  item,
  width,
  height,
  active,
  playing,
  loop,
  muted,
  progress,
  onEnded,
  onPosterLoaded,
  unplayableNote,
  styles,
}: {
  item: MediaSource;
  width: number;
  height: number;
  /** The item on screen; the ones either side load quietly and report nothing. */
  active: boolean;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  progress: SharedValue<number>;
  onEnded: () => void;
  onPosterLoaded: () => void;
  /** Why a video that can't play here doesn't. */
  unplayableNote: string;
  styles: Styles;
}) {
  // A linked video streams straight from Photos (modules/photos-video): no
  // copy, original quality. Elsewhere, or if it won't load, its poster
  // stands in, and in the film it holds like a photo before moving on.
  const localId = item.fromLibrary && item.uri.startsWith("ph://") ? item.uri.slice(5) : null;
  const playable = !!localId && !!PhotosVideoView;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const usable = playable && !failed;

  useEffect(() => {
    if (!active || usable || !playing || loop) return;
    const timer = setTimeout(onEnded, PHOTO_MS);
    return () => clearTimeout(timer);
  }, [active, usable, playing, loop, onEnded]);

  const Video = PhotosVideoView;
  return (
    <View style={{ width, height, justifyContent: "center" }}>
      <AppImage
        source={{ uri: item.uri }}
        style={[StyleSheet.absoluteFill, { width, height }]}
        contentFit="contain"
        onLoad={onPosterLoaded}
      />
      {usable && Video ? (
        <Video
          localId={localId}
          playing={playing}
          muted={muted}
          loop={loop}
          volume={CLIP_LEVEL}
          style={[{ width, height }, !ready && styles.hidden]}
          onReady={() => setReady(true)}
          onProgress={(e) => {
            if (active) progress.value = e.nativeEvent.fraction;
          }}
          onEnd={active ? onEnded : undefined}
          onError={() => setFailed(true)}
        />
      ) : null}
      {!ready && active ? (
        <View style={styles.videoNote} pointerEvents="none">
          {usable ? (
            <ActivityIndicator color={PAPER_ON_GLASS} />
          ) : (
            <Text style={styles.videoNoteText}>
              {failed ? "This video couldn't be loaded from Photos" : unplayableNote}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: NIGHT },
    night: { backgroundColor: NIGHT },
    // Kept laid out (so it can load and play) but unseen until ready.
    hidden: { opacity: 0 },
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
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    bottomRow: {
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
    hint: {
      ...theme.typography.meta,
      color: PAPER_ON_GLASS,
      backgroundColor: INK_GLASS,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.full,
      overflow: "hidden",
    },
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
