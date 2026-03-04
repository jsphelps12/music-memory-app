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
  background: "#FBF6F1",
  backgroundSecondary: "#F3EDE6",
  backgroundTertiary: "#EBE4DC",
  backgroundInput: "#F8F3EE",
  text: "#000",
  textSecondary: "#666",
  textTertiary: "#999",
  accent: "#E8825C",
  accentBg: "#fdf0eb",
  accentText: "#c96840",
  accentSecondary: "#6B5F8C",
  accentSecondaryBg: "#F0EDF7",
  accentSecondaryText: "#4A3E6A",
  buttonBg: "#2C2C3A",
  buttonText: "#fff",
  border: "#ddd",
  placeholder: "#999",
  destructive: "#d32f2f",
  success: "#2e7d32",
  chipBg: "#f0f0f0",
  chipText: "#333",
  chipSelectedBg: "#2C2C3A",
  chipSelectedText: "#fff",
  cardBg: "#F3EDE6",
  tabBar: "#FBF6F1",
  tabBarBorder: "#E0D6CC",
  tabBarActive: "#E8825C",
  tabBarInactive: "#999",
  closeButtonBg: "rgba(0,0,0,0.06)",
  skeletonBase: "#e8e8e8",
  skeletonHighlight: "#f5f5f5",
  artworkPlaceholder: "#e0e0e0",
};

const darkColors: ThemeColors = {
  background: "#0D0908",
  backgroundSecondary: "#1E1A18",
  backgroundTertiary: "#2A2422",
  backgroundInput: "#1E1A18",
  text: "#fff",
  textSecondary: "#ababab",
  textTertiary: "#777",
  accent: "#E8825C",
  accentBg: "#3a2820",
  accentText: "#F0A080",
  accentSecondary: "#9888C8",
  accentSecondaryBg: "#251F38",
  accentSecondaryText: "#C0AEE8",
  buttonBg: "#F5EEE8",
  buttonText: "#1A0F0A",
  border: "#333",
  placeholder: "#666",
  destructive: "#ff453a",
  success: "#30d158",
  chipBg: "#2A2422",
  chipText: "#e0e0e0",
  chipSelectedBg: "#F5EEE8",
  chipSelectedText: "#1A0F0A",
  cardBg: "#1E1A1A",
  tabBar: "#0D0908",
  tabBarBorder: "#2A2422",
  tabBarActive: "#E8825C",
  tabBarInactive: "#666",
  closeButtonBg: "rgba(255,255,255,0.1)",
  skeletonBase: "#2A2422",
  skeletonHighlight: "#38302E",
  artworkPlaceholder: "#2A2422",
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
