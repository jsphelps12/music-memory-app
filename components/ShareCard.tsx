// Snapshot-friendly share card — dark, ~3:4 portrait.
// Rendered inside a ViewShot ref in ShareCardModal; keep this pure RN with no animations.

import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Moment } from "@/types";

const SCREEN_WIDTH = Dimensions.get("window").width;
export const CARD_WIDTH = SCREEN_WIDTH - 48;
export const CARD_HEIGHT = Math.round(CARD_WIDTH * (4 / 3));

interface Props {
  moment: Moment;
  photoUrl: string | null;  // resolved public URL for the selected photo
}

export function ShareCard({ moment, photoUrl }: Props) {
  const date = moment.momentDate
    ? new Date(moment.momentDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const reflection =
    moment.reflectionText
      ? moment.reflectionText.length > 110
        ? moment.reflectionText.slice(0, 110).trimEnd() + "…"
        : moment.reflectionText
      : null;

  const heroHeight = Math.round(CARD_HEIGHT * 0.55);

  return (
    <View style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
      {/* Hero — photo if available, otherwise artwork */}
      <View style={[styles.hero, { height: heroHeight }]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : moment.songArtworkUrl ? (
          <Image
            source={{ uri: moment.songArtworkUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={styles.heroEmpty} />
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Song row: artwork thumbnail + title/artist */}
        <View style={styles.songRow}>
          {moment.songArtworkUrl ? (
            <Image
              source={{ uri: moment.songArtworkUrl }}
              style={styles.artwork}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={1}>
              {moment.songTitle}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {moment.songArtist}
            </Text>
          </View>
        </View>

        {reflection ? (
          <Text style={styles.reflection} numberOfLines={3}>
            "{reflection}"
          </Text>
        ) : null}

        <View style={styles.footer}>
          {date ? <Text style={styles.date}>{date}</Text> : <View />}
          <Text style={styles.wordmark}>Tracks</Text>
        </View>
      </View>
    </View>
  );
}

const BG = "#0D0D0F";
const SURFACE = "#1A1A1F";

const styles = StyleSheet.create({
  card: {
    backgroundColor: BG,
    borderRadius: 20,
    overflow: "hidden",
  },
  hero: {
    width: "100%",
    backgroundColor: SURFACE,
  },
  heroEmpty: {
    flex: 1,
    backgroundColor: SURFACE,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    justifyContent: "space-between",
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 20,
  },
  songArtist: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
    marginTop: 1,
  },
  reflection: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 19,
    fontStyle: "italic",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 10,
  },
  date: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "500",
  },
  wordmark: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E8825C",
    letterSpacing: 0.5,
  },
});
