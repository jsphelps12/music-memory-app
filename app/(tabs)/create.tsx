import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function CreateMomentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    songId?: string;
    songTitle?: string;
    songArtist?: string;
    songAlbum?: string;
    songArtwork?: string;
    songAppleMusicId?: string;
    songDurationMs?: string;
  }>();

  const hasSong = !!params.songTitle;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Moment</Text>
      <Text style={styles.subtitle}>Capture a music memory</Text>

      {hasSong ? (
        <TouchableOpacity
          style={styles.songCard}
          onPress={() => router.push("/song-search")}
        >
          {params.songArtwork ? (
            <Image
              source={{ uri: params.songArtwork }}
              style={styles.artwork}
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>
              {params.songTitle}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {params.songArtist}
            </Text>
          </View>
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => router.push("/song-search")}
        >
          <Text style={styles.selectButtonText}>Select Song</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 80,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
  },
  selectButton: {
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  selectButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 12,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  artworkPlaceholder: {
    backgroundColor: "#e0e0e0",
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  songArtist: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  changeText: {
    fontSize: 14,
    color: "#999",
    marginLeft: 8,
  },
});
