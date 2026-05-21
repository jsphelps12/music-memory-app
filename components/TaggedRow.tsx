import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { useTheme } from "@/hooks/useTheme";
import type { TaggedMoment } from "@/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Props {
  tag: TaggedMoment;
  onPress: () => void;
}

export function TaggedRow({ tag, onPress }: Props) {
  const theme = useTheme();
  const artwork = tag.moment?.songArtworkUrl;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {artwork ? (
        <Image source={{ uri: artwork }} style={styles.artwork} contentFit="cover" />
      ) : (
        <ArtworkPlaceholder style={styles.artwork} />
      )}
      <View style={styles.info}>
        <Text style={[styles.song, { color: theme.colors.text }]} numberOfLines={1}>
          {tag.moment?.songTitle ?? "Unknown song"}
        </Text>
        <Text style={[styles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {tag.moment?.songArtist ?? ""}
        </Text>
        <Text style={[styles.by, { color: theme.colors.textTertiary }]} numberOfLines={1}>
          {tag.taggerDisplayName ?? "Someone"} tagged you
        </Text>
      </View>
      <Text style={[styles.date, { color: theme.colors.textTertiary }]}>
        {timeAgo(tag.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: 6,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  song: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
  },
  artist: {
    fontSize: 13,
    marginTop: 1,
  },
  by: {
    fontSize: 12,
    marginTop: 3,
  },
  date: {
    fontSize: 12,
    marginLeft: 8,
  },
});
