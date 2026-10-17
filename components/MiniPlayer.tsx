import { useCallback, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";
import { formatTime } from "@/lib/formatTime";
import { Theme } from "@/constants/theme";

export function MiniPlayer() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
    // Phase 1: a floating card above the tab bar, not a full-width band.
    <View style={styles.card}>
      <View style={styles.mainRow}>
        {currentSong.artworkUrl ? (
          <AppImage source={{ uri: currentSong.artworkUrl }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={[styles.artwork, styles.artworkEmpty]} />
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {currentSong.title}
          </Text>
          <View style={styles.artistRow}>
            <Text style={styles.artist} numberOfLines={1}>
              {currentSong.artistName}
            </Text>
            {isPreview && <Text style={styles.previewBadge}>PREVIEW</Text>}
          </View>
        </View>
        <TouchableOpacity
          onPress={isPlaying ? pause : resume}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={stop}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Stop"
        >
          <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {playbackDuration > 0 && (
        <View style={styles.scrubRow}>
          <Text style={styles.time}>{formatTime(playbackTime)}</Text>
          <View
            style={styles.trackWrapper}
            onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
            {...panResponder.panHandlers}
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${fillPct}%` }]} />
            </View>
          </View>
          <Text style={styles.time}>{formatTime(playbackDuration)}</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 10,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.elevated,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: theme.isDark ? 0.45 : 0.12,
      shadowRadius: 14,
      elevation: 6,
    },
    mainRow: {
      height: 60,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 10,
      paddingRight: 4,
      gap: 12,
    },
    artwork: {
      width: 40,
      height: 40,
      borderRadius: 6,
    },
    artworkEmpty: {
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    info: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    artistRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    artist: {
      flexShrink: 1,
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    previewBadge: {
      fontSize: 10,
      fontFamily: theme.fonts.bodySemibold,
      letterSpacing: 0.8,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    btn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    scrubRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingBottom: 6,
      marginTop: -6,
      gap: 8,
    },
    trackWrapper: {
      flex: 1,
      height: 24,
      justifyContent: "center",
    },
    track: {
      height: 3,
      borderRadius: 2,
      overflow: "hidden",
      backgroundColor: theme.colors.divider,
    },
    fill: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.text,
    },
    time: {
      fontSize: 11,
      fontFamily: theme.fonts.body,
      fontVariant: ["tabular-nums"],
      color: theme.colors.textSecondary,
      minWidth: 30,
    },
  });
}
