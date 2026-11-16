import { Platform, StyleProp, StyleSheet, TextStyle, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
// design-lint-ignore: the one place Ionicons is drawn (the Android fallback).
import { Ionicons } from "@expo/vector-icons";
import { ICON_SYMBOLS, symbolFor, type IconName } from "@/lib/iconSymbols";

export type { IconName };
export { ICON_SYMBOLS };

/**
 * Icons follow the reader's text size, within limits: an icon sits in a
 * fixed control (a 32pt disc, a 44pt header target) far more often than text
 * does, so it grows to 1.3x at most, the size where those controls still hold
 * it. At the default text size the scale is exactly 1.
 */
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;

interface Props {
  /** Ionicons-style name; drawn as its SF Symbol on iOS (lib/iconSymbols.ts). */
  name: IconName;
  size?: number;
  color?: string;
  /**
   * Layout only (margins, a wider slot). As with the Ionicons glyph, the icon
   * sits at the start of a wider slot unless `textAlign` centres it.
   */
  style?: StyleProp<TextStyle>;
  /** Keep the given size whatever the text size (the tab bar). */
  fixedSize?: boolean;
  /**
   * Icons are decorative unless labelled: a labelled icon is announced as an
   * image, an unlabelled one is hidden from VoiceOver (its button or row
   * carries the label).
   */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The app's one icon (DESIGN.md, Components). SF Symbols on iOS, in a
 * monochrome tint and a weight that sits with DM Sans; Ionicons on Android,
 * and for any name the symbol table doesn't know (with a dev warning).
 */
export function Icon({
  name,
  size = 24,
  color,
  style,
  fixedSize = false,
  accessibilityLabel,
  testID,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const scale = fixedSize ? 1 : Math.min(MAX_SCALE, Math.max(MIN_SCALE, fontScale));
  const px = Math.round(size * scale * 2) / 2;
  const spec = symbolFor(name);

  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel }
    : {
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

  if (__DEV__ && !spec) warnUnknown(name);

  const fallback = (
    <Ionicons
      name={name as React.ComponentProps<typeof Ionicons>["name"]}
      size={px}
      color={color}
      style={style}
      testID={testID}
      {...a11y}
    />
  );
  if (Platform.OS !== "ios" || !spec) return fallback;

  const { textAlign, ...slot } = StyleSheet.flatten(style) ?? {};
  return (
    <View
      style={[
        { width: px, height: px },
        slot,
        textAlign === "center" ? styles.center : textAlign === "right" ? styles.end : null,
      ]}
      testID={testID}
      {...a11y}
    >
      <View style={[styles.square, { width: px, height: px }]}>
        <SymbolView
          name={spec.symbol}
          type="monochrome"
          tintColor={color}
          // Regular matches DM Sans at body sizes; at 16pt and under a regular
          // stroke reads thinner than the text beside it.
          weight={size <= 16 ? "medium" : "regular"}
          size={px * spec.box}
          style={
            spec.x || spec.y
              ? { transform: [{ translateX: (spec.x ?? 0) * px }, { translateY: (spec.y ?? 0) * px }] }
              : undefined
          }
          fallback={fallback}
        />
      </View>
    </View>
  );
}

const warned = new Set<string>();
function warnUnknown(name: string) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`Icon: no SF Symbol for "${name}"; drawing the Ionicons glyph. Add it to lib/iconSymbols.ts.`);
}

const styles = StyleSheet.create({
  // The icon's own square. The symbol's frame (size × box) centres on it and
  // may overflow it a little, as the Ionicons glyph's line box did.
  square: {
    alignItems: "center",
    justifyContent: "center",
  },
  center: { alignItems: "center" },
  end: { alignItems: "flex-end" },
});
