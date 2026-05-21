// Snapshot-friendly share card — 9:16 Story format (TikTok/Reels/Instagram).
// Rendered inside a ViewShot ref in ShareCardModal; keep this pure RN with no animations.

import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Moment } from "@/types";
import { MOODS } from "@/constants/Moods";

const SCREEN_WIDTH = Dimensions.get("window").width;
export const CARD_WIDTH = SCREEN_WIDTH - 48;
export const CARD_HEIGHT = Math.round(CARD_WIDTH * (16 / 9));

interface Props {
  moment: Moment;
  photoUrl: string | null;
}

export function ShareCard({ moment, photoUrl }: Props) {
  const date = moment.momentDate
    ? new Date(moment.momentDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).toUpperCase()
    : null;

  const reflection =
    moment.reflectionText
      ? moment.reflectionText.length > 120
        ? moment.reflectionText.slice(0, 120).trimEnd() + "…"
        : moment.reflectionText
      : null;

  const heroHeight = Math.round(CARD_HEIGHT * 0.60);
  const contentHeight = CARD_HEIGHT - heroHeight;
  const heroSource = photoUrl ?? moment.songArtworkUrl ?? null;
  const moodDef = moment.mood ? MOODS.find((m) => m.value === moment.mood) : null;

  return (
    <View style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
      {/* ── Hero (top 60%) ─────────────────────────────────────────────── */}
      <View style={[styles.hero, { height: heroHeight }]}>
        {heroSource ? (
          <Image
            source={{ uri: heroSource }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={styles.heroEmpty} />
        )}

        {/* Date + location eyebrow over photo */}
        <View style={styles.eyebrowContainer}>
          {date ? <Text style={styles.eyebrowDate}>{date}</Text> : null}
          {moment.location ? (
            <Text style={styles.eyebrowLocation}>📍 {moment.location}</Text>
          ) : null}
        </View>

        {/* Gradient fade into content panel */}
        <View style={[styles.heroFade, { height: heroHeight * 0.5 }]} />
      </View>

      {/* ── Content panel (bottom 40%) ──────────────────────────────────── */}
      <View style={[styles.content, { height: contentHeight }]}>
        {/* Song row */}
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
            {reflection}
          </Text>
        ) : null}

        <View style={styles.footer}>
          {moodDef ? (
            <View style={styles.moodChip}>
              <Text style={styles.moodChipText}>
                {moodDef.emoji} {moodDef.label}
              </Text>
            </View>
          ) : date ? (
            <Text style={styles.footerDate}>{date}</Text>
          ) : (
            <View />
          )}
          <Text style={styles.wordmark}>SOUNDTRACKS</Text>
        </View>
      </View>
    </View>
  );
}

const BG = "#0F0D0B";

const styles = StyleSheet.create({
  card: {
    backgroundColor: BG,
    borderRadius: 20,
    overflow: "hidden",
  },
  hero: {
    width: "100%",
    backgroundColor: "#1A1612",
  },
  heroEmpty: {
    flex: 1,
    backgroundColor: "#1A1612",
  },
  eyebrowContainer: {
    position: "absolute",
    top: 20,
    left: 22,
    gap: 3,
  },
  eyebrowDate: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1.8,
    color: "rgba(255,255,255,0.85)",
  },
  eyebrowLocation: {
    fontSize: 10,
    fontFamily: "DMSans_500Medium",
    color: "rgba(255,255,255,0.65)",
  },
  heroFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    // Linear gradient approximated with a solid-to-transparent overlay
    backgroundColor: BG,
    opacity: 0.7,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    justifyContent: "space-between",
    backgroundColor: BG,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    lineHeight: 22,
  },
  songArtist: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  reflection: {
    fontFamily: "DMSerifDisplay_400Regular_Italic",
    fontSize: 16,
    lineHeight: 23,
    color: "rgba(255,255,255,0.92)",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 14,
    paddingTop: 10,
  },
  moodChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  moodChipText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: "rgba(255,255,255,0.75)",
  },
  footerDate: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
  },
  wordmark: {
    fontSize: 11,
    fontFamily: "DMSans_700Bold",
    color: "#E8825C",
    letterSpacing: 1.4,
  },
});
