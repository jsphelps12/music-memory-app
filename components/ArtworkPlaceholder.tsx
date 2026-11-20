import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  style?: StyleProp<ViewStyle>;
}

/** Glyph size as a share of the tile's short side, kept readable but quiet. */
function glyphSize(side: number) {
  return Math.round(Math.min(64, Math.max(14, side * 0.34)));
}

/**
 * "No artwork": a flat tile with a music note (DESIGN.md, "The Artwork Is the
 * Color"; no gradients). Sized from the style when it has numeric
 * dimensions, otherwise measured, so the note scales from a 40pt row thumb
 * to a full-width hero.
 */
export function ArtworkPlaceholder({ style }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const flat = StyleSheet.flatten(style) ?? {};
  const w = typeof flat.width === "number" ? flat.width : undefined;
  const h = typeof flat.height === "number" ? flat.height : undefined;
  const known = w !== undefined || h !== undefined ? Math.min(w ?? Infinity, h ?? Infinity) : undefined;
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const side = known ?? measured;

  const onLayout =
    known === undefined
      ? (e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setMeasured(Math.min(width, height));
        }
      : undefined;

  return (
    <View
      style={[styles.tile, style]}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {side ? <Icon name="musical-notes" size={glyphSize(side)} color={theme.colors.textTertiary} /> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    tile: {
      backgroundColor: theme.colors.artworkPlaceholder,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
