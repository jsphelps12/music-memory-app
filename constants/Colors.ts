// Deprecated: use constants/theme.ts and hooks/useTheme.ts instead.
// Kept for backwards compatibility.
import { getTheme } from "./theme";

const light = getTheme("light").colors;
const dark = getTheme("dark").colors;

export default {
  light: {
    text: light.text,
    background: light.background,
    tint: light.accent,
    tabIconDefault: light.tabBarInactive,
    tabIconSelected: light.tabBarActive,
  },
  dark: {
    text: dark.text,
    background: dark.background,
    tint: dark.accent,
    tabIconDefault: dark.tabBarInactive,
    tabIconSelected: dark.tabBarActive,
  },
};
