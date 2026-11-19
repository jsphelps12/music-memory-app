import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { AppImage } from "@/components/AppImage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { artworkUrlAtSize } from "@/lib/itunes";

interface Props {
  year: number;
  count: number;
  /** Up to four covers from the year, for the small mosaic. */
  artwork: string[];
  onPress: () => void;
}

/**
 * The way into Year in review from Rediscover in December and January: a
 * row on the page (not a boxed promo), a small mosaic of the year's covers,
 * the serif title and a Meta line.
 */
export function YearReviewEntry({ year, count, artwork, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tiles = artwork.slice(0, 4);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your ${year} in songs, ${count} moments`}
      accessibilityHint="Plays your year in review"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.mosaic}>
        {tiles.map((url) => (
          <AppImage key={url} source={{ uri: artworkUrlAtSize(url, 120) }} style={styles.tile} />
        ))}
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{`Your ${year} in songs`}</Text>
        <Text style={styles.meta}>{`${count} moments · play your year`}</Text>
      </View>
      <Icon name="play" size={18} color={theme.colors.text} />
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.7 },
    mosaic: {
      width: 56,
      height: 56,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 2,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    tile: {
      width: 27,
      height: 27,
    },
    text: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    meta: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
  });
}
