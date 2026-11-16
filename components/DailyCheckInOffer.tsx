import { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import {
  checkInOfferDone,
  DEFAULT_CHECK_IN,
  formatCheckInTime,
  markCheckInOfferDone,
  readCheckInSettings,
  setCheckIn,
} from "@/lib/dailyCheckIn";

/**
 * The Journal's one-time offer of the daily check-in: a quiet row (not a
 * banner), shown once someone has a moment, gone for good after either
 * answer. The time can be changed later in Settings.
 */
export function DailyCheckInOffer({ userId, hasMoments }: { userId: string; hasMoments: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const [state, setState] = useState<"hidden" | "offer" | "done" | "denied">("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasMoments) return;
    let cancelled = false;
    void Promise.all([checkInOfferDone(userId), readCheckInSettings(userId)]).then(([done, settings]) => {
      if (!cancelled && !done && !settings.enabled) setState("offer");
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hasMoments]);

  if (state === "hidden") return null;

  const time = formatCheckInTime(DEFAULT_CHECK_IN.hour, DEFAULT_CHECK_IN.minute);

  // Notifications were turned off for the app earlier: iOS won't ask again,
  // so say so instead of silently doing nothing.
  if (state === "denied") {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite">
        <View style={styles.textCol}>
          <Text style={styles.title}>Notifications are off</Text>
          <Text style={styles.text}>Turn them on for Soundtracks in iOS Settings, then switch on the check-in in Settings → Journal.</Text>
        </View>
        <View style={styles.actions}>
          <Button label="Open Settings" size="pill" variant="secondary" onPress={() => Linking.openSettings()} align="center" />
          <IconButton name="close" onPress={() => setState("hidden")} size={18} color={theme.colors.textSecondary} accessibilityLabel="Dismiss" />
        </View>
      </View>
    );
  }

  if (state === "done") {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{`Done. We'll ask at ${time}. Change it in Settings.`}</Text>
        <IconButton name="close" onPress={() => setState("hidden")} size={18} color={theme.colors.textSecondary} accessibilityLabel="Dismiss" />
      </View>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    Haptics.selectionAsync();
    const result = await setCheckIn(userId, { ...DEFAULT_CHECK_IN, enabled: true });
    await markCheckInOfferDone(userId);
    posthog?.capture("daily_checkin_changed", { enabled: result.settings.enabled, hour: DEFAULT_CHECK_IN.hour, minute: 0, source: "journal_offer" });
    setBusy(false);
    setState(result.settings.enabled ? "done" : result.permission === "denied" ? "denied" : "hidden");
  };

  const dismiss = async () => {
    await markCheckInOfferDone(userId);
    posthog?.capture("daily_checkin_offer_dismissed");
    setState("hidden");
  };

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>A nudge each night?</Text>
        <Text style={styles.text}>{`We'll ask what song you listened to today, at ${time}. Skipped if you've already saved one.`}</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Turn on" size="pill" onPress={turnOn} loading={busy} align="center" />
        <IconButton name="close" onPress={dismiss} size={18} color={theme.colors.textSecondary} accessibilityLabel="Not now" />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    textCol: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    text: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: -10,
    },
  });
}
