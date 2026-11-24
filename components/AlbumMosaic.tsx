import { useMemo } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Icon } from "@/components/Icon";
import { AppImage } from "@/components/AppImage";
import { getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { mosaicFace } from "@/lib/albumMosaic";

interface Props {
  /** Storage path of the album's own cover photo; wins when set. */
  coverPhotoPath?: string | null;
  /** Song artworks from the album, newest first (see fetchAlbumArtworks). */
  artworks?: string[];
  style?: StyleProp<ViewStyle>;
}

/**
 * An album's face: its cover photo if it has one, else its songs' artworks
 * (one full bleed, or a 2×2 grid from two up: lib/albumMosaic.ts), else a
 * quiet empty tile. Square; size it with `style`.
 */
export function AlbumMosaic({ coverPhotoPath, artworks = [], style }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const face = mosaicFace(artworks);
  let content;
  if (coverPhotoPath) {
    content = (
      <AppImage
        source={{ uri: getPublicPhotoUrl(coverPhotoPath) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    );
  } else if (face.kind === "grid") {
    content = (
      <View style={styles.grid}>
        {[face.cells.slice(0, 2), face.cells.slice(2, 4)].map((pair, row) => (
          <View key={row} style={styles.gridRow}>
            {pair.map((uri, col) => (
              // By position: two and three covers repeat one (lib/albumMosaic.ts).
              <AppImage key={col} source={{ uri }} style={styles.cell} contentFit="cover" />
            ))}
          </View>
        ))}
      </View>
    );
  } else if (face.kind === "single") {
    content = <AppImage source={{ uri: face.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />;
  } else {
    content = (
      <View style={styles.empty}>
        <Icon name="albums-outline" size={28} color={theme.colors.textSecondary} />
      </View>
    );
  }

  return <View style={[styles.frame, style]}>{content}</View>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    frame: {
      aspectRatio: 1,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    grid: {
      flex: 1,
      gap: 2,
    },
    gridRow: {
      flex: 1,
      flexDirection: "row",
      gap: 2,
    },
    cell: {
      flex: 1,
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
