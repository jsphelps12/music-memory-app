import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { artworkUrlAtSize } from "@/lib/itunes";
import type { PastSong } from "@/lib/pastPairings";

const ART = 48;
const THUMB = 56;

/**
 * A song from the library paired with the photos of when it was added, in
 * Rediscover (On this day, From before). Ruled like On this day's own rows:
 * when, then song and artist, then why, then the photos. Tapping always
 * starts a moment (a week can hold more than one); once one is saved, Open
 * goes to it.
 */
export function PastPairingRow({
  song,
  when,
  line,
  artworkUrl,
  photoUris,
  saved,
  first = false,
  onPress,
  onOpenSaved,
}: {
  song: PastSong;
  /** "2 years ago" or "Added June 3, 2019". */
  when: string;
  /** "the week of 14 photos", "3 photos that day", or "". */
  line: string;
  artworkUrl: string;
  photoUris: string[];
  saved: boolean;
  /** No rule above the first row of a section. */
  first?: boolean;
  /** Starts a new moment. */
  onPress: () => void;
  /** Opens the moment already saved from it. */
  onOpenSaved?: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const album =
    song.albumTracks && song.albumTracks > 1 ? `With ${song.albumTracks - 1} more from ${song.albumTitle || "the album"}` : "";
  const joined = [album, line].filter(Boolean).join(" · ");
  const why = joined ? joined[0].toUpperCase() + joined.slice(1) : "";

  return (
    <TouchableOpacity
      style={[styles.row, !first && styles.ruled]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${when}. ${song.title}, ${song.artistName}.${why ? ` ${why}.` : ""}${saved ? " Saved." : ""}`}
      accessibilityHint="Starts a moment with this song"
    >
      <View style={styles.top}>
        {artworkUrl ? (
          <AppImage source={{ uri: artworkUrlAtSize(artworkUrl, ART * 3) }} style={styles.art} transition={150} />
        ) : (
          <ArtworkPlaceholder style={styles.art} />
        )}
        <View style={styles.text}>
          <Text style={styles.when}>{saved ? `${when} · Saved` : when}</Text>
          <Text style={styles.songLine} numberOfLines={1}>
            <Text style={styles.song}>{song.title}</Text>
            <Text style={styles.artist}>{`  ${song.artistName}`}</Text>
          </Text>
          {why ? (
            <Text style={styles.why} numberOfLines={1}>
              {why}
            </Text>
          ) : null}
        </View>
        {/* The row always makes a new moment; a saved one also offers Open. */}
        {saved && onOpenSaved ? (
          <Button label="Open" variant="text" size="pill" onPress={onOpenSaved} />
        ) : (
          <Icon name="add" size={20} color={theme.colors.textSecondary} />
        )}
      </View>
      {photoUris.length > 0 ? (
        <View style={styles.photos}>
          {photoUris.map((uri) => (
            <AppImage key={uri} source={{ uri }} style={styles.photo} contentFit="cover" />
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { paddingVertical: theme.spacing.md },
    ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    top: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    art: { width: ART, height: ART, borderRadius: theme.radii.sm },
    text: { flex: 1, gap: 2 },
    when: { ...theme.typography.meta, color: theme.colors.textSecondary },
    songLine: { ...theme.typography.body },
    song: { ...theme.typography.bodyStrong, color: theme.colors.text },
    artist: { ...theme.typography.body, color: theme.colors.textSecondary },
    why: { ...theme.typography.meta, color: theme.colors.textTertiary },
    photos: {
      flexDirection: "row",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
      marginLeft: ART + theme.spacing.md,
    },
    photo: {
      width: THUMB,
      height: THUMB,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.artworkPlaceholder,
    },
  });
}
