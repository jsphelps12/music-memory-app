// Coming back to the app from the background. React Native has no window
// focus, so React Query's refetch-on-focus never fired: every screen showed
// whatever it loaded before the app was backgrounded, until a manual pull
// (2026-11-15, "my most recent moment wasn't there until I refreshed").
//
// wireQueryFocus() teaches React Query that "active" is focus, so stale
// queries on mounted screens refetch on return. useOnForeground() is for the
// screens that manage their own state (the Journal).

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { focusManager } from "@tanstack/react-query";

let wired = false;

/** Call once at startup. Idempotent. */
export function wireQueryFocus(): void {
  if (wired) return;
  wired = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      handleFocus(state === "active");
    });
    return () => sub.remove();
  });
}

/**
 * True when returning to the foreground should refetch: never on the very
 * first load (that path has its own fetch), always when something was marked
 * stale, otherwise once the cooldown has passed. Pure; tested.
 */
export function shouldRefreshOnResume(
  lastFetchAt: number,
  now: number,
  cooldownMs: number,
  stale = false
): boolean {
  if (lastFetchAt === 0) return false;
  if (stale) return true;
  return now - lastFetchAt >= cooldownMs;
}

/**
 * Runs `onForeground` each time the app becomes active after having been in
 * the background. "inactive" (Control Center, the app switcher peek) is not a
 * background trip, so a pull of Control Center doesn't trigger a refresh.
 */
export function useOnForeground(onForeground: () => void): void {
  const cb = useRef(onForeground);
  cb.current = onForeground;
  useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        wasBackground = true;
      } else if (state === "active" && wasBackground) {
        wasBackground = false;
        cb.current();
      }
    });
    return () => sub.remove();
  }, []);
}
