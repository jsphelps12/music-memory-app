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
import * as MediaLibrary from "expo-media-library/legacy";
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
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { Icon } from "@/components/Icon";
import { usePlayerControls } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import type { MediaSource } from "@/lib/linkedMedia";

/** In film mode, how long a photo holds before the next. */
const PHOTO_MS = 4000;
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

/**
 * A moment's photos and videos as a little film (1.4, Josh's call). Swipe
 * through them in order; pinch a photo to zoom; videos play muted, and the
 * speaker brings their sound up while the song ducks (lib/audioMix.ts).
 * Play turns it into a film: the song plays, photos drift for a few seconds
 * each, videos play through, then the next. Story-style segments across the
 * top show where you are. Drag down or ✕ to close. Nothing is exported.
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
  const reduceMotion = useReducedMotion();
  const { duck } = usePlayerControls();
  const [index, setIndex] = useState(initialIndex);
  const [film, setFilm] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const listRef = useRef<FlatList<MediaSource>>(null);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const current = items[index];

  // Leaving a clip with its sound on brings the song back.
  const setClipSound = useCallback(
    (on: boolean) => {
      setSoundOn(on);
      duck(on);
    },
    [duck]
  );

  const close = useCallback(() => {
    if (soundOn) setClipSound(false);
    setFilm(false);
    onClose();
  }, [onClose, setClipSound, soundOn]);

  const goTo = useCallback(
    (i: number, animated = true) => {
      if (i < 0 || i >= items.length) return;
      listRef.current?.scrollToIndex({ index: i, animated });
      setIndex(i);
    },
    [items.length]
  );

  const advance = useCallback(() => {
    if (index + 1 < items.length) goTo(index + 1);
    else setFilm(false); // the end: stay on the last
  }, [goTo, index, items.length]);

  // A new page: sound off, progress from zero.
  useEffect(() => {
    if (soundOn) setClipSound(false);
    cancelAnimation(progress);
    progress.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Film mode on a photo: fill its segment over PHOTO_MS, then advance.
  useEffect(() => {
    if (!visible || !film || !current || current.kind !== "photo") return;
    progress.value = withTiming(1, { duration: PHOTO_MS * (1 - progress.value), easing: Easing.linear }, (done) => {
      if (done) runOnJS(advance)();
    });
    return () => cancelAnimation(progress);
  }, [visible, film, current, advance, progress]);

  const toggleFilm = () => {
    Haptics.selectionAsync();
    if (film) {
      // A film pauses as one: the song with it.
      setFilm(false);
      if (songPlaying) pauseSong();
      return;
    }
    if (!songPlaying) startSong();
    setFilm(true);
  };

  const onOpen = () => {
    setIndex(initialIndex);
    setFilm(false);
    dragY.value = 0;
    setTimeout(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 50);
  };

  // Drag down to close; sideways stays with the pager.
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

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.min(dragY.value / (CLOSE_DRAG * 3), 0.5),
  }));

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onShow={onOpen} onRequestClose={close}>
      <GestureDetector gesture={closeGesture}>
        <Animated.View style={[styles.screen, sheetStyle]}>
          <FlatList
            ref={listRef}
            data={items}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, i) => `${i}:${item.uri}`}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            initialScrollIndex={initialIndex < items.length ? initialIndex : 0}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index: i }) =>
              item.kind === "video" ? (
                <VideoPage
                  item={item}
                  width={width}
                  height={height}
                  active={visible && i === index}
                  film={film}
                  muted={!soundOn}
                  progress={progress}
                  onEnded={advance}
                  styles={styles}
                />
              ) : (
                <PhotoPage
                  uri={item.uri}
                  width={width}
                  height={height}
                  drifting={visible && film && i === index && !reduceMotion}
                />
              )
            }
          />

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
            {items.length > 1 ? (
              <TouchableOpacity
                onPress={toggleFilm}
                style={[styles.glassButton, styles.pill]}
                accessibilityRole="button"
                accessibilityLabel={film ? "Pause the film" : "Play as a film with the song"}
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
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

function Segment({
  state,
  progress,
  styles,
}: {
  state: "done" | "now" | "next";
  progress: { value: number };
  styles: ReturnType<typeof createStyles>;
}) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === "done" ? 1 : state === "now" ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fill]} />
    </View>
  );
}

function PhotoPage({ uri, width, height, drifting }: { uri: string; width: number; height: number; drifting: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (drifting) {
      scale.value = 1;
      scale.value = withTiming(DRIFT_SCALE, { duration: PHOTO_MS + 600, easing: Easing.out(Easing.quad) });
    } else {
      scale.value = withTiming(1, { duration: 300 });
    }
  }, [drifting, scale]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
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
      <Animated.View style={[{ width, height }, drift]}>
        <AppImage source={{ uri }} style={{ width, height }} contentFit="contain" transition={200} />
      </Animated.View>
    </ScrollView>
  );
}

function VideoPage({
  item,
  width,
  height,
  active,
  film,
  muted,
  progress,
  onEnded,
  styles,
}: {
  item: MediaSource;
  width: number;
  height: number;
  active: boolean;
  film: boolean;
  muted: boolean;
  progress: { value: number };
  onEnded: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  // A linked video plays from Photos (downloading from iCloud if needed).
  // Elsewhere only its poster exists.
  const localId = item.fromLibrary && item.uri.startsWith("ph://") ? item.uri.slice(5) : null;
  const [file, setFile] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !localId || file) return;
    let cancelled = false;
    void MediaLibrary.getAssetInfoAsync(localId)
      .then((info) => {
        if (cancelled) return;
        if (info.localUri) setFile(info.localUri);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
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
      if (film) onEnded();
      else {
        player.currentTime = 0;
        player.play();
      }
    });
    const tick = player.addListener("timeUpdate", ({ currentTime }) => {
      if (active && player.duration > 0) progress.value = Math.min(1, currentTime / player.duration);
    });
    return () => {
      ended.remove();
      tick.remove();
    };
  }, [player, film, onEnded, active, progress]);

  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {file ? (
        <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} />
      ) : (
        <View style={{ width, height }}>
          <AppImage source={{ uri: item.uri }} style={{ width, height }} contentFit="contain" />
          <View style={styles.videoNote} pointerEvents="none">
            {localId && !failed ? (
              <ActivityIndicator color={PAPER_ON_GLASS} />
            ) : (
              <Text style={styles.videoNoteText}>
                {failed ? "This video isn't in your library anymore" : "Plays on the phone it came from"}
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
