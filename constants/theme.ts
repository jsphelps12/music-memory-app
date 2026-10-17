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
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 32,
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

// App icon gradient: warm orange (#E8825C) → muted slate-purple
// Use with expo-linear-gradient for brand moments
export const gradients = {
  brand: ["#E8825C", "#6B5F8C"] as const,
  brandDark: ["#E8825C", "#9888C8"] as const,
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
  backgroundInput: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentBg: string;
  accentText: string;
  accentSecondary: string;
  accentSecondaryBg: string;
  accentSecondaryText: string;
  buttonBg: string;
  buttonText: string;
  border: string;
  /** Hairline between list rows: the Phase 1 replacement for card boxes. */
  divider: string;
  placeholder: string;
  destructive: string;
  success: string;
  chipBg: string;
  chipText: string;
  chipSelectedBg: string;
  chipSelectedText: string;
  cardBg: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  closeButtonBg: string;
  skeletonBase: string;
  skeletonHighlight: string;
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
  backgroundInput: "#F8F3EE",
  text: "#23222B",
  textSecondary: "#5E5C66",
  textTertiary: "#736A63",
  accent: "#D9693F",
  accentBg: "#fdf0eb",
  accentText: "#c96840",
  accentSecondary: "#6B5F8C",
  accentSecondaryBg: "#F0EDF7",
  accentSecondaryText: "#4A3E6A",
  buttonBg: "#23222B",
  buttonText: "#fff",
  border: "#E0D8CF",
  divider: "#E9E2D9",
  placeholder: "#7A716A",
  destructive: "#d32f2f",
  success: "#2e7d32",
  chipBg: "#F0EAE3",
  chipText: "#3D3C48",
  chipSelectedBg: "#23222B",
  chipSelectedText: "#fff",
  cardBg: "#F3EDE6",
  tabBar: "#FBF7F2",
  tabBarBorder: "#E9E2D9",
  tabBarActive: "#23222B",
  tabBarInactive: "#6E655E",
  closeButtonBg: "rgba(44,44,58,0.06)",
  skeletonBase: "#EAE3DB",
  skeletonHighlight: "#F5EFE9",
  artworkPlaceholder: "#E5DDD4",
};

const darkColors: ThemeColors = {
  background: "#0E0B0A",
  backgroundSecondary: "#1E1A18",
  backgroundTertiary: "#2A2422",
  backgroundInput: "#1E1A18",
  text: "#F5F0EB",
  textSecondary: "#ABA39E",
  textTertiary: "#8E847E",
  accent: "#EE8B62",
  accentBg: "#3a2820",
  accentText: "#F0A080",
  accentSecondary: "#9888C8",
  accentSecondaryBg: "#251F38",
  accentSecondaryText: "#C0AEE8",
  buttonBg: "#F5EEE8",
  buttonText: "#1A0F0A",
  border: "#362F2C",
  divider: "#2A2422",
  placeholder: "#857B75",
  destructive: "#ff453a",
  success: "#30d158",
  chipBg: "#2A2422",
  chipText: "#e0e0e0",
  chipSelectedBg: "#F5EEE8",
  chipSelectedText: "#1A0F0A",
  cardBg: "#1E1A1A",
  tabBar: "#0E0B0A",
  tabBarBorder: "#2A2422",
  tabBarActive: "#F5F0EB",
  tabBarInactive: "#A99E95",
  closeButtonBg: "rgba(255,255,255,0.1)",
  skeletonBase: "#2A2422",
  skeletonHighlight: "#38302E",
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
  };
}
