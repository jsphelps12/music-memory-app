import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { FullWindowOverlay } from "react-native-screens";
import { usePathname } from "expo-router";
import { monotonicMs } from "@/modules/now-playing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import {
  APP_LOCK_STORAGE_KEY,
  AuthAttempt,
  BiometryKind,
  decideToggle,
  decideUnlock,
  lockMethodLabel,
  needsDeviceCheck,
  parseLockSetting,
  shouldLockOnReturn,
} from "@/lib/appLock";

// App lock (1.4). See lib/appLock.ts for the rules.
//
// The cover renders in a FullWindowOverlay: most screens here are native
// modals (a moment, Capture, Edit) that a view in the root would sit under.
// FullWindowOverlay isn't its own window, though: on mount it adds a
// container to the key window, on top of whatever is presented right then,
// and it can't mount at all in the background (there's no key window). So
// while the lock is on the overlay stays mounted, empty unless covering
// (an empty one passes touches through), and it remounts on every return to
// the foreground and every route change to stay above newly presented
// screens.

type SetResult = { ok: true } | { ok: false; message: string | null };

interface AppLockValue {
  /** null until the stored setting has been read. */
  enabled: boolean | null;
  /** What unlocks the app on this device. */
  method: BiometryKind;
  /** "Face ID", "Touch ID" or "Passcode". */
  methodLabel: string;
  /** Turning it on or off asks for Face ID first. */
  setEnabled: (value: boolean) => Promise<SetResult>;
}

const AppLockContext = createContext<AppLockValue | null>(null);

export function useAppLock(): AppLockValue {
  const v = useContext(AppLockContext);
  if (!v) throw new Error("useAppLock must be used inside AppLockProvider");
  return v;
}

async function detectMethod(): Promise<BiometryKind> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!hasHardware || !enrolled) return "passcode";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "touch";
  } catch {}
  return "passcode";
}

/**
 * Face ID, falling back to the device passcode. Returns the attempt and, for
 * a "no passcode" error only, whether the device agrees it has no way to
 * authenticate (null when that couldn't be checked). lib/appLock.ts decides
 * what to do with it.
 */
async function authenticate(promptMessage: string): Promise<{ attempt: AuthAttempt; deviceHasAuth: boolean | null }> {
  let attempt: AuthAttempt;
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: false });
    attempt = r.success ? { success: true } : { success: false, error: r.error };
  } catch {
    attempt = { success: false, error: "exception" };
  }
  let deviceHasAuth: boolean | null = null;
  if (needsDeviceCheck(attempt)) {
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      deviceHasAuth = level !== LocalAuthentication.SecurityLevel.NONE;
    } catch {}
  }
  return { attempt, deviceHasAuth };
}

/**
 * `fontsLoaded`: the cover draws no text until the app's fonts are in. Text
 * measured in the fallback font is cached, so a label drawn in DM Sans later
 * truncates ("Unlock with Face…").
 */
export function AppLockProvider({ children, fontsLoaded }: { children: ReactNode; fontsLoaded: boolean }) {
  const [enabled, setEnabledState] = useState<boolean | null>(null);
  const [method, setMethod] = useState<BiometryKind>("face");
  // Locked: needs Face ID. Covered: hidden for the app switcher snapshot.
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  // Why the last unlock didn't work, under the retry button (null: nothing
  // to say, e.g. a cancel).
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  // Set when the lock turned itself off because the phone can't authenticate
  // anymore: the cover says so once, with a Continue button.
  const [turnedOffNotice, setTurnedOffNotice] = useState<string | null>(null);
  const enabledRef = useRef(false);
  // Read by unlock(), which must stay stable (the effects below key on it).
  const methodLabelRef = useRef(lockMethodLabel("face"));
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);
  // Bumped to remount the overlay on top (see the note at the top).
  const [overlayKey, setOverlayKey] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    if (enabledRef.current) setOverlayKey((k) => k + 1);
  }, [pathname]);

  const methodLabel = lockMethodLabel(method);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    const { attempt, deviceHasAuth } = await authenticate("Unlock Soundtracks");
    prompting.current = false;
    const decision = decideUnlock(attempt, methodLabelRef.current, deviceHasAuth);
    if (decision.kind === "unlock") {
      setLockMessage(null);
      setLocked(false);
      setCovered(false);
    } else if (decision.kind === "stay_locked") {
      setLockMessage(decision.message);
    } else {
      // The phone can't authenticate anyone (its passcode was removed), so
      // nothing could ever lift the cover. Turn the setting off and say so;
      // the cover stays up with the notice until Continue.
      enabledRef.current = false;
      try {
        await AsyncStorage.removeItem(APP_LOCK_STORAGE_KEY);
      } catch {}
      setLockMessage(null);
      setTurnedOffNotice(decision.message);
    }
  }, []);

  const dismissTurnedOffNotice = useCallback(() => {
    setTurnedOffNotice(null);
    setLocked(false);
    setCovered(false);
    setEnabledState(false);
  }, []);

  // Cold start: read the setting; lock straight away when it's on.
  useEffect(() => {
    let cancelled = false;
    void detectMethod().then((m) => {
      if (cancelled) return;
      methodLabelRef.current = lockMethodLabel(m);
      setMethod(m);
    });
    AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)
      .catch(() => null)
      .then((v) => {
        if (cancelled) return;
        const on = parseLockSetting(v);
        enabledRef.current = on;
        setEnabledState(on);
        if (on) {
          setLocked(true);
          void unlock();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [unlock]);

  // Background: cover the screen (the app switcher snapshot) and note when.
  // Return: lock again after the grace period, otherwise just uncover.
  // "inactive" is ignored on purpose: Face ID's own prompt, Control Center
  // and permission alerts all pass through it.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (!enabledRef.current) return;
      if (next === "background") {
        backgroundedAt.current = monotonicMs();
        setCovered(true);
      } else if (next === "active") {
        setOverlayKey((k) => k + 1);
        const lockNow = shouldLockOnReturn(true, backgroundedAt.current, monotonicMs());
        backgroundedAt.current = null;
        if (lockNow) {
          setLockMessage(null);
          setLocked(true);
          void unlock();
        } else {
          setCovered(false);
        }
      }
    });
    return () => sub.remove();
  }, [unlock]);

  const setEnabled = useCallback(
    async (value: boolean): Promise<SetResult> => {
      const { attempt, deviceHasAuth } = await authenticate(
        value ? `Turn on ${methodLabel} lock` : `Turn off ${methodLabel} lock`
      );
      const decision = decideToggle(value, attempt, methodLabel, deviceHasAuth);
      if (decision.kind === "refuse") return { ok: false, message: decision.message };
      try {
        if (value) await AsyncStorage.setItem(APP_LOCK_STORAGE_KEY, "1");
        else await AsyncStorage.removeItem(APP_LOCK_STORAGE_KEY);
      } catch {
        return { ok: false, message: "Couldn't save that. Try again." };
      }
      enabledRef.current = value;
      setEnabledState(value);
      setOverlayKey((k) => k + 1);
      return { ok: true };
    },
    [methodLabel]
  );

  const value = useMemo(() => ({ enabled, method, methodLabel, setEnabled }), [enabled, method, methodLabel, setEnabled]);

  // Until the setting is read we don't know whether to cover; the launch
  // screen is still up for that moment anyway, so cover to be safe.
  const showCover = enabled === null || locked || covered;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {enabled !== false ? (
        <Overlay key={overlayKey}>
          {showCover ? (
            <LockCover
              // Only a real lock offers the button; the snapshot cover and the
              // first instant before the setting is read are a blank page.
              action={
                turnedOffNotice
                  ? { label: "Continue", onPress: dismissTurnedOffNotice }
                  : locked
                    ? { label: `Unlock with ${methodLabel}`, onPress: unlock }
                    : null
              }
              message={turnedOffNotice ?? (locked ? lockMessage : null)}
              showText={fontsLoaded}
            />
          ) : null}
        </Overlay>
      ) : null}
    </AppLockContext.Provider>
  );
}

function LockCover({
  action,
  message,
  showText,
}: {
  action: { label: string; onPress: () => void } | null;
  /** Why the lock is still up, or that it turned itself off. */
  message: string | null;
  showText: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      {showText ? (
        <View style={styles.center}>
          <Icon name="lock-closed-outline" size={28} color={theme.colors.textSecondary} />
          <Text style={styles.title}>Soundtracks</Text>
          {message ? (
            <Text style={styles.message} accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
        </View>
      ) : null}
      {action && showText ? (
        <View style={[styles.action, { paddingBottom: insets.bottom + theme.spacing.xl }]}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

/** FullWindowOverlay is iOS-only; elsewhere an absolute view is the best we have. */
function Overlay({ children }: { children: ReactNode }) {
  if (Platform.OS === "ios") return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return children ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View> : null;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    cover: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.colors.background,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.md,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    message: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: theme.spacing.xl,
    },
    action: {
      paddingHorizontal: theme.spacing.xl,
    },
  });
}
