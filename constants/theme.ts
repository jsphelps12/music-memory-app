import { StyleSheet, ViewStyle } from "react-native";

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
  backgroundInput: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentBg: string;
  accentText: string;
  buttonBg: string;
  buttonText: string;
  border: string;
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

const lightColors: ThemeColors = {
  background: "#fff",
  backgroundSecondary: "#f5f5f5",
  backgroundTertiary: "#f0f0f0",
  backgroundInput: "#fafafa",
  text: "#000",
  textSecondary: "#666",
  textTertiary: "#999",
  accent: "#007AFF",
  accentBg: "#e8f0fe",
  accentText: "#1a73e8",
  buttonBg: "#000",
  buttonText: "#fff",
  border: "#ddd",
  placeholder: "#999",
  destructive: "#d32f2f",
  success: "#2e7d32",
  chipBg: "#f0f0f0",
  chipText: "#333",
  chipSelectedBg: "#000",
  chipSelectedText: "#fff",
  cardBg: "#f5f5f5",
  tabBar: "#fff",
  tabBarBorder: "#e0e0e0",
  tabBarActive: "#007AFF",
  tabBarInactive: "#999",
  closeButtonBg: "rgba(0,0,0,0.06)",
  skeletonBase: "#e8e8e8",
  skeletonHighlight: "#f5f5f5",
  artworkPlaceholder: "#e0e0e0",
};

const darkColors: ThemeColors = {
  background: "#000",
  backgroundSecondary: "#1c1c1e",
  backgroundTertiary: "#2c2c2e",
  backgroundInput: "#1c1c1e",
  text: "#fff",
  textSecondary: "#ababab",
  textTertiary: "#777",
  accent: "#0A84FF",
  accentBg: "#1a2a3e",
  accentText: "#5aafff",
  buttonBg: "#fff",
  buttonText: "#000",
  border: "#333",
  placeholder: "#666",
  destructive: "#ff453a",
  success: "#30d158",
  chipBg: "#2c2c2e",
  chipText: "#e0e0e0",
  chipSelectedBg: "#fff",
  chipSelectedText: "#000",
  cardBg: "#1c1c1e",
  tabBar: "#000",
  tabBarBorder: "#333",
  tabBarActive: "#0A84FF",
  tabBarInactive: "#666",
  closeButtonBg: "rgba(255,255,255,0.1)",
  skeletonBase: "#2c2c2e",
  skeletonHighlight: "#3a3a3c",
  artworkPlaceholder: "#2c2c2e",
};

export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
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
    spacing,
    fontSize,
    fontWeight,
    radii,
    shadows,
  };
}
