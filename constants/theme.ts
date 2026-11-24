import { ViewStyle } from "react-native";

export const fonts = {
  display: "DMSerifDisplay_400Regular",
  displayItalic: "DMSerifDisplay_400Regular_Italic",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemibold: "DMSans_600SemiBold",
  bodyBold: "DMSans_700Bold",
  // Reading face for what the user wrote (Phase 1, 2026-10): long journal
  // text in a roman serif, not the display face and not italic.
  reading: "Newsreader_400Regular",
  readingMedium: "Newsreader_500Medium",
  mono: "SpaceMono",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export const fontSize = {
  xs: 12,
  /** Meta and labels: dates, counts, section labels (DESIGN.md "Meta"/"Label"). */
  meta: 13,
  sm: 14,
  /** Compact buttons and secondary UI copy. */
  callout: 15,
  base: 16,
  /** Reading size for what a person wrote, in lists (Newsreader). */
  reading: 17,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 32,
  /** Screen titles and the hero song title (DESIGN.md "Headline"). */
  headline: 34,
} as const;

/**
 * The type roles from DESIGN.md, so a screen picks a role instead of
 * re-deriving family + size + leading. Colors stay with the caller.
 */
export const typography = {
  headline: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27 },
  reading: { fontFamily: fonts.reading, fontSize: 17, lineHeight: 25 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 21 },
  callout: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 17, letterSpacing: 0.2 },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 17, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const radii = {
  sm: 8,
  md: 12,
  button: 14,
  lg: 20,
  full: 9999,
} as const;

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
  none: {} as ViewStyle,
};

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  /** Terracotta that may be thin or small (caret, selection): DESIGN.md "Terracotta Text". */
  accentText: string;
  buttonBg: string;
  buttonText: string;
  border: string;
  /** Hairline between list rows: the Phase 1 replacement for card boxes. */
  divider: string;
  /** Raised surfaces that float over content (mini player, sheets). */
  elevated: string;
  /** The warm dim behind a bottom sheet or menu. Never pure black. */
  scrim: string;
  /** Frosted paper (night in dark) disc behind controls over artwork, photos or a map. */
  glass: string;
  /** Icon/text color on `glass` and on warm-ink overlays over imagery. */
  onGlass: string;
  /** Shadow color for things that lift (night, never pure black). */
  shadow: string;
  /** A Switch's "on" track: ink on paper, Graphite on night (ink-as-paper would hide the white thumb). */
  switchOn: string;
  /** Placeholder text and the icon inside a field: one muted color, AA on a field on a sheet. */
  placeholder: string;
  destructive: string;
  success: string;
  /**
   * The one quiet fill (fields, chips, secondary buttons, segmented track,
   * empty avatar/art): translucent ink on paper, paper on night, so it steps
   * the same off any surface, a sheet included. Never put a fill on a fill.
   */
  fill: string;
  /** A pressed row on a sheet or menu. */
  fillPressed: string;
  chipText: string;
  chipSelectedBg: string;
  chipSelectedText: string;
  cardBg: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  skeletonBase: string;
  artworkPlaceholder: string;
}

// Warm-tint neutrals (design polish, 2026-08): no pure grays.
// Phase 1 (2026-10, "let the artwork be the color"): deeper ink, a slightly
// lighter paper, and secondary/tertiary text that pass WCAG AA on it (the old
// tertiary #9C9AA1 was ~2.6:1). The accent is darker so it holds 3:1 as an
// icon/indicator color; it is a signal, not a text color.
const lightColors: ThemeColors = {
  background: "#FBF7F2",
  backgroundSecondary: "#F3EDE6",
  backgroundTertiary: "#EBE4DC",
  text: "#23222B",
  textSecondary: "#5E5C66",
  textTertiary: "#736A63",
  accent: "#D9693F",
  accentText: "#B04F2A",
  buttonBg: "#23222B",
  buttonText: "#FBF7F2",
  border: "#E0D8CF",
  divider: "#E9E2D9",
  elevated: "#FFFFFF",
  scrim: "rgba(35,34,43,0.16)",
  glass: "rgba(251,247,242,0.86)",
  onGlass: "#23222B",
  shadow: "#0E0B0A",
  switchOn: "#23222B",
  placeholder: "#6A615A",
  destructive: "#C62828",
  success: "#2e7d32",
  fill: "rgba(35,34,43,0.06)",
  fillPressed: "rgba(35,34,43,0.10)",
  chipText: "#3D3C48",
  chipSelectedBg: "#23222B",
  chipSelectedText: "#FBF7F2",
  cardBg: "#F3EDE6",
  tabBar: "#FBF7F2",
  tabBarBorder: "#E9E2D9",
  tabBarActive: "#23222B",
  tabBarInactive: "#736A63",
  skeletonBase: "#EBE4DC",
  artworkPlaceholder: "#E5DDD4",
};

const darkColors: ThemeColors = {
  background: "#0E0B0A",
  backgroundSecondary: "#1E1A18",
  backgroundTertiary: "#2A2422",
  text: "#F5F0EB",
  textSecondary: "#ABA39E",
  textTertiary: "#8E847E",
  accent: "#EE8B62",
  accentText: "#EE8B62",
  buttonBg: "#F5EEE8",
  buttonText: "#0E0B0A",
  border: "#362F2C",
  divider: "#2A2422",
  elevated: "#26211F",
  scrim: "rgba(14,11,10,0.55)",
  glass: "rgba(38,33,31,0.8)",
  onGlass: "#F5F0EB",
  shadow: "#0E0B0A",
  switchOn: "#ABA39E",
  placeholder: "#A39992",
  destructive: "#ff453a",
  success: "#30d158",
  fill: "rgba(245,240,235,0.10)",
  fillPressed: "rgba(245,240,235,0.16)",
  chipText: "#E8E1DA",
  chipSelectedBg: "#F5EEE8",
  chipSelectedText: "#0E0B0A",
  cardBg: "#1E1A18",
  tabBar: "#0E0B0A",
  tabBarBorder: "#2A2422",
  tabBarActive: "#F5F0EB",
  tabBarInactive: "#8E847E",
  skeletonBase: "#2A2422",
  artworkPlaceholder: "#2A2422",
};

export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
  fonts: typeof fonts;
  spacing: typeof spacing;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  radii: typeof radii;
  shadows: typeof shadows;
  typography: typeof typography;
}

export function getTheme(colorScheme: "light" | "dark" | null | undefined): Theme {
  const isDark = colorScheme === "dark";
  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
    fonts,
    spacing,
    fontSize,
    fontWeight,
    radii,
    shadows,
    typography,
  };
}
