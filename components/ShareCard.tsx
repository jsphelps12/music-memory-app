// Snapshot-friendly share card — rendered inside a ViewShot ref on the
// share-card screen (app/share-card.tsx); keep this pure RN with no animations.
//
// Design (Sharing v2 Phase D, owner-decided): the card is a kept artifact —
// the photo prints clean and edge-to-edge with NO overlay or gradient, and
// everything written lives below it on paper chrome, like the mat of an
// instant photo. Serif title, the reflection in Newsreader (upright: it's
// what the person wrote), one quiet meta line, the serif wordmark. When the
// moment has no photo, the album art becomes the hero.
//
// Colors are deliberately fixed, not theme tokens: the export is a PNG that
// must look identical from a dark-mode phone. They are the light theme's
// paper and ink values (DESIGN.md, design sweep 2026-11), copied here so the
// card stays self-contained when it renders off-screen.

import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppImage } from "@/components/AppImage";
import { PartialMoment } from "@/types";
import { MOODS } from "@/constants/Moods";
import { fonts } from "@/constants/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
export const CARD_WIDTH = SCREEN_WIDTH - 48;
// 4:5 portrait for feeds; 9:16 for Stories/Reels — same component, two prints.
export const CARD_HEIGHT_POST = Math.round(CARD_WIDTH * (5 / 4));
export const CARD_HEIGHT_STORY = Math.round(CARD_WIDTH * (16 / 9));

export type ShareCardVariant = "post" | "story";

interface Props {
  moment: PartialMoment;
  photoUrl: string | null;
  variant?: ShareCardVariant;
}

const PAPER = "#FBF7F2";
const PAPER_DEEP = "#F3EDE6";
const INK = "#23222B";
const GRAPHITE = "#5E5C66";
const UMBER_GRAY = "#736A63";
const HAIRLINE = "#E9E2D9";

export function ShareCard({ moment, photoUrl, variant = "post" }: Props) {
  const cardHeight = variant === "story" ? CARD_HEIGHT_STORY : CARD_HEIGHT_POST;
  // Story gets a taller print; post keeps more room for the chrome.
  const heroHeight = Math.round(cardHeight * (variant === "story" ? 0.64 : 0.56));

  const date = moment.momentDate
    ? new Date(moment.momentDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const reflection =
    moment.reflectionText
      ? moment.reflectionText.length > 140
        ? moment.reflectionText.slice(0, 140).trimEnd() + "…"
        : moment.reflectionText
      : null;

  // Photo is the hero when the moment has one (owner rule); album art steps in
  // otherwise — and then the thumbnail row would just repeat it, so it hides.
  const artIsHero = !photoUrl;
  const heroSource = photoUrl ?? moment.songArtworkUrl ?? null;

  // First mood only — compact layout, and the first mood is the primary one
  // (selection order, mirrored in the legacy mood column). As a word: moods
  // are words, not emoji.
  const moodDef = moment.moods[0] ? MOODS.find((m) => m.value === moment.moods[0]) : null;

  const metaParts = [moodDef?.label, date, moment.location].filter(Boolean) as string[];

  return (
    <View style={[styles.card, { width: CARD_WIDTH, height: cardHeight }]}>
      {/* ── Hero — clean print, nothing written on it ─────────────────── */}
      <View style={[styles.hero, { height: heroHeight }]}>
        {heroSource ? (
          <AppImage source={{ uri: heroSource }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.heroEmpty}>
            <Ionicons name="musical-notes" size={56} color={UMBER_GRAY} />
          </View>
        )}
      </View>

      {/* ── Chrome — the cream mat ────────────────────────────────────── */}
      <View style={styles.chrome}>
        <View style={styles.songRow}>
          {!artIsHero && moment.songArtworkUrl ? (
            <AppImage source={{ uri: moment.songArtworkUrl }} style={styles.artwork} contentFit="cover" />
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
          <Text style={styles.reflection} numberOfLines={variant === "story" ? 3 : 2}>
            “{reflection}”
          </Text>
        ) : (
          <View style={styles.reflectionSpacer} />
        )}

        <View style={styles.footer}>
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(" · ")}
          </Text>
          <Text style={styles.wordmark}>Soundtracks</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PAPER,
    borderRadius: 20,
    overflow: "hidden",
  },
  hero: {
    width: "100%",
    backgroundColor: PAPER_DEEP,
  },
  heroEmpty: {
    flex: 1,
    backgroundColor: PAPER_DEEP,
    alignItems: "center",
    justifyContent: "center",
  },
  chrome: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 18,
    justifyContent: "space-between",
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 24,
    fontFamily: fonts.display,
    color: INK,
    lineHeight: 28,
  },
  songArtist: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: GRAPHITE,
    marginTop: 1,
  },
  reflection: {
    fontFamily: fonts.reading,
    fontSize: 15,
    lineHeight: 22,
    color: INK,
    marginTop: 10,
  },
  reflectionSpacer: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    marginTop: 12,
    paddingTop: 11,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.body,
    fontVariant: ["tabular-nums"],
    color: GRAPHITE,
  },
  wordmark: {
    fontSize: 16,
    fontFamily: fonts.display,
    color: INK,
  },
});
