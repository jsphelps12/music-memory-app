import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "@/contexts/PlayerContext";
import { useTheme } from "@/hooks/useTheme";

export function MiniPlayer() {
  const theme = useTheme();
  const { currentSong, isPlaying, pause, resume, stop } = usePlayer();

  if (!currentSong) return null;

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: theme.colors.cardBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
      },
    ]}>
      {currentSong.artworkUrl ? (
        <Image source={{ uri: currentSong.artworkUrl }} style={styles.artwork} contentFit="cover" />
      ) : (
        <View style={[styles.artwork, { backgroundColor: theme.colors.backgroundSecondary }]} />
      )}
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {currentSong.title}
        </Text>
        <Text style={[styles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {currentSong.artistName}
        </Text>
      </View>
      <TouchableOpacity onPress={isPlaying ? pause : resume} hitSlop={8} style={styles.btn}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={theme.colors.accent} />
      </TouchableOpacity>
      <TouchableOpacity onPress={stop} hitSlop={8} style={styles.btn}>
        <Ionicons name="close" size={20} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  artist: {
    fontSize: 11,
    marginTop: 1,
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
