import { useMemo } from "react";
import { useColorScheme } from "@/components/useColorScheme";
import { getTheme, Theme } from "@/constants/theme";

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  return useMemo(() => getTheme(colorScheme), [colorScheme]);
}
