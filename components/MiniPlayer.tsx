import { useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { formatTime } from "@/lib/formatTime";

export function MiniPlayer() {
  const theme = useTheme();
  const { currentSong, isPlaying, isPreview, playbackTime, playbackDuration, pause, resume, stop, seekTo } = usePlayer();
  const barWidthRef = useRef(1);
  const playbackDurationRef = useRef(playbackDuration);
  playbackDurationRef.current = playbackDuration;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;

  // True once the drag has committed to scrubbing. Until then the responder is
  // held loosely: a parent can take it back, and nothing has been seeked.
  const scrubbingRef = useRef(false);

  const seekToTouch = useCallback((locationX: number) => {
    const ratio = Math.max(0, Math.min(1, locationX / barWidthRef.current));
    seekToRef.current(ratio * playbackDurationRef.current);
  }, []);

  // The track is a 28pt band around a 3px bar, so a finger lands in it easily
  // by accident. Granting the responder is fine; seeking on the grant is not —
  // that made merely touching down jump playback, and would hijack any drag
  // that was only passing through on its way to scrolling a parent list. The
  // seek is deferred until the drag proves horizontal, or until a lift proves
  // it was a tap.
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => playbackDurationRef.current > 0,
    onPanResponderTerminationRequest: () => !scrubbingRef.current,
    onPanResponderGrant: () => { scrubbingRef.current = false; },
    onPanResponderMove: (e, g) => {
      if (!scrubbingRef.current) {
        if (Math.abs(g.dx) <= 12 || Math.abs(g.dx) <= Math.abs(g.dy)) return;
        scrubbingRef.current = true;
      }
      seekToTouch(e.nativeEvent.locationX);
    },
    onPanResponderRelease: (e, g) => {
      // A lift that never became a scrub is a tap-to-seek.
      if (!scrubbingRef.current && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
        seekToTouch(e.nativeEvent.locationX);
      }
      scrubbingRef.current = false;
    },
    onPanResponderTerminate: () => { scrubbingRef.current = false; },
  })).current;

  if (!currentSong) return null;

  const fillPct = playbackDuration > 0 ? Math.min(100, (playbackTime / playbackDuration) * 100) : 0;

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: theme.colors.cardBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
      },
    ]}>
      <View style={styles.mainRow}>
        {currentSong.artworkUrl ? (
          <AppImage source={{ uri: currentSong.artworkUrl }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={[styles.artwork, { backgroundColor: theme.colors.backgroundSecondary }]} />
        )}
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {currentSong.title}
          </Text>
          <View style={styles.artistRow}>
            <Text style={[styles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {currentSong.artistName}
            </Text>
            {isPreview && (
              <Text style={[styles.previewBadge, { color: theme.colors.textTertiary }]}>PREVIEW</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={isPlaying ? pause : resume} hitSlop={8} style={styles.btn}>
          <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={theme.colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={stop} hitSlop={8} style={styles.btn}>
          <Ionicons name="close" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>
      {playbackDuration > 0 && (
        <View style={styles.scrubRow}>
          <Text style={[styles.time, { color: theme.colors.textTertiary }]}>{formatTime(playbackTime)}</Text>
          <View
            style={styles.trackWrapper}
            onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
            {...panResponder.panHandlers}
          >
            <View style={[styles.track, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: theme.colors.accent }]} />
            </View>
          </View>
          <Text style={[styles.time, { color: theme.colors.textTertiary }]}>{formatTime(playbackDuration)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
  },
  mainRow: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  artwork: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artist: {
    fontSize: 11,
    marginTop: 1,
  },
  previewBadge: {
    fontSize: 9,
    fontFamily: "DMSans_600SemiBold",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  scrubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  trackWrapper: {
    flex: 1,
    height: 28,
    justifyContent: "center",
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
  time: {
    fontSize: 10,
    fontFamily: "DMSans_400Regular",
    minWidth: 28,
  },
});
