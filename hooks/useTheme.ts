import { createContext, createElement, ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "@/components/useColorScheme";
import { getTheme, Theme } from "@/constants/theme";

type Scheme = "light" | "dark";

// Set by <ThemeScheme> for a subtree that always renders in one scheme,
// whatever the phone's setting (Year in review is always night). Every
// shared component reads the theme through useTheme, so they all follow it.
const SchemeOverride = createContext<Scheme | null>(null);

export function ThemeScheme({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return createElement(SchemeOverride.Provider, { value: scheme }, children);
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const override = useContext(SchemeOverride);
  const scheme = override ?? system;
  return useMemo(() => getTheme(scheme), [scheme]);
}
