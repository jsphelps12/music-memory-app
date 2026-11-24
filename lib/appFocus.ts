// Coming back to the app from the background. React Native has no window
// focus, so React Query's refetch-on-focus never fired: every screen showed
// whatever it loaded before the app was backgrounded, until a manual pull
// (2026-11-15, "my most recent moment wasn't there until I refreshed").
//
// wireQueryFocus() teaches React Query that coming back from the background is focus, so stale
// queries on mounted screens refetch on return. useOnForeground() is for the
// screens that manage their own state (the Journal).

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

let wired = false;

/**
 * Call once at startup. Idempotent. Two signals React Query can't see on its
 * own in React Native: returning to the app counts as focus, and the
 * connection coming back counts as online (1.4, NetInfo), so stale queries
 * on mounted screens refetch on both.
 */
export function wireQueryFocus(): void {
  if (wired) return;
  wired = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      const focused = queryFocusFor(state);
      if (focused !== null) handleFocus(focused);
    });
    return () => sub.remove();
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnline(state.isConnected, state.isInternetReachable));
    })
  );
}

/**
 * What an app state change tells React Query's focus: the background is
 * unfocused, active is focused, and "inactive" (Control Center, a Face ID
 * prompt, the app switcher peek) says nothing, so coming back from it isn't
 * a return to the app and doesn't refetch. React Query only refetches when
 * focus actually changes. Pure; tested.
 */
export function queryFocusFor(state: AppStateStatus): boolean | null {
  if (state === "background") return false;
  if (state === "active") return true;
  return null;
}

/**
 * Online unless NetInfo says otherwise. isInternetReachable is null while
 * it's still checking, which must not count as offline. Pure; tested.
 */
export function isOnline(isConnected: boolean | null, isInternetReachable: boolean | null | undefined): boolean {
  if (isConnected === false) return false;
  return isInternetReachable !== false;
}

/**
 * Whether the phone has a connection right now, by NetInfo. Online when
 * NetInfo can't tell (isOnline above), so a save is still tried.
 */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return isOnline(state.isConnected, state.isInternetReachable);
  } catch {
    return true;
  }
}

/**
 * Runs `onReconnect` when the connection comes back after being lost (not on
 * the first reading). For screens that manage their own state (the Journal).
 */
export function useOnReconnect(onReconnect: () => void): void {
  const cb = useRef(onReconnect);
  cb.current = onReconnect;
  useEffect(() => {
    let wasOffline = false;
    return NetInfo.addEventListener((state) => {
      const online = isOnline(state.isConnected, state.isInternetReachable);
      if (!online) wasOffline = true;
      else if (wasOffline) {
        wasOffline = false;
        cb.current();
      }
    });
  }, []);
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
