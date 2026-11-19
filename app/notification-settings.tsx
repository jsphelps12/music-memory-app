import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { ListRow } from "@/components/ListRow";
import { DailyCheckInRow } from "@/components/DailyCheckInRow";
import { useAuth } from "@/contexts/AuthContext";
import { useOnForeground } from "@/lib/appFocus";
import { friendlyError } from "@/lib/errors";
import { refreshLastWeekReady } from "@/lib/lastWeekReady";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import type { NotifFrequency, UserProfile } from "@/types";

// Settings → Notifications (1.4, Josh 2026-11-17). Three groups instead of
// five switches: your check-in, things coming back, and friends; one "How
// often" over things coming back; friends go quiet at night. Server side:
// send-notifications (spacing, the cascade), notify-social and
// accept-friend-invite (_shared/socialPush.ts). Local: lib/dailyCheckIn.ts,
// lib/lastWeekReady.ts.

type Field = "notifOnThisDay" | "notifResurfacing" | "notifMilestones" | "notifSocial" | "notifQuietHours" | "notifLastWeek";

const FREQUENCIES: { value: NotifFrequency; label: string; sub?: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "few", label: "A few times a week" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off", sub: "Friends and your check-in still come through" },
];

const EVENT_NAME: Record<Field | "notifFrequency", string> = {
  notifOnThisDay: "notif_on_this_day",
  notifResurfacing: "notif_resurfacing",
  notifMilestones: "notif_milestones",
  notifSocial: "notif_social",
  notifQuietHours: "notif_quiet_hours",
  notifLastWeek: "notif_last_week",
  notifFrequency: "notif_frequency",
};

type Pending = { field: Field; value: boolean } | { field: "notifFrequency"; value: NotifFrequency };

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { user, profile, updateProfile } = useAuth();
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("granted");
  // The profile in AuthContext is the source of truth; this only holds the
  // value being saved, so the control moves on tap.
  const [pending, setPending] = useState<Pending | null>(null);

  const readPermission = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined"))
      .catch(() => {});
  }, []);
  useFocusEffect(readPermission);
  useOnForeground(readPermission);

  const value = <K extends Field | "notifFrequency">(field: K): UserProfile[K] | undefined =>
    (pending?.field === field ? pending.value : profile?.[field]) as UserProfile[K] | undefined;

  const save = async (next: Pending) => {
    if (!user || !profile || pending) return;
    Haptics.selectionAsync();
    setPending(next);
    posthog.capture("notification_preferences_changed", {
      notification_type: EVENT_NAME[next.field],
      ...(next.field === "notifFrequency" ? { frequency: next.value } : { enabled: next.value }),
    });
    try {
      await updateProfile({ [next.field]: next.value });
      // The Sunday reminder is local: re-plan it with the new setting.
      void refreshLastWeekReady({ ...profile, [next.field]: next.value }, { force: true });
    } catch (e) {
      Alert.alert("Couldn't save", friendlyError(e));
    } finally {
      setPending(null);
    }
  };

  const frequency = value("notifFrequency") ?? "few";
  const memoriesOff = frequency === "off";

  const toggle = (field: Field, label: string, subtitle: string, opts: { last?: boolean; disabled?: boolean } = {}) => (
    <ListRow
      label={label}
      subtitle={subtitle}
      subtitleLines={3}
      last={opts.last}
      disabled={opts.disabled}
      trailing={
        <Switch
          value={!opts.disabled && (value(field) ?? true)}
          onValueChange={(v) => void save({ field, value: v })}
          disabled={opts.disabled || !!pending || !profile}
          trackColor={{ false: theme.colors.border, true: theme.colors.switchOn }}
          ios_backgroundColor={theme.colors.border}
          accessibilityLabel={label}
        />
      }
    />
  );

  return (
    <View style={styles.container}>
      <ScreenHeader leading="back" title="Notifications" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["4xl"] }]}>
        {permission !== "granted" ? (
          <View style={[styles.list, styles.blocked]}>
            <ListRow
              label="Notifications are off for Soundtracks"
              subtitle="Turn them on in iOS Settings for any of these to arrive."
              subtitleLines={2}
              icon="notifications-off-outline"
              detail="Open"
              onPress={() => Linking.openSettings()}
              last
            />
          </View>
        ) : null}

        <SectionLabel style={styles.groupLabel}>Your check-in</SectionLabel>
        <View style={styles.list}>
          {user ? <DailyCheckInRow userId={user.id} /> : null}
          {toggle("notifMilestones", "Streak milestones", "On a day you hit 5, 10, 25 or 50 days in a row", { last: true })}
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>Things coming back</SectionLabel>
        <View style={styles.list}>
          {toggle("notifOnThisDay", "On this day", "A song you saved on this date, years ago", { disabled: memoriesOff })}
          {toggle("notifResurfacing", "Random memories", "A moment from at least a month back", { disabled: memoriesOff })}
          {toggle("notifLastWeek", "Last week is ready", "Sunday at 6pm, when your week had songs or photos", {
            disabled: memoriesOff,
            last: true,
          })}
        </View>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>How often</SectionLabel>
        <View style={styles.list}>
          {FREQUENCIES.map((f, i) => (
            <ListRow
              key={f.value}
              label={f.label}
              subtitle={f.sub}
              accessory="check"
              selected={frequency === f.value}
              onPress={frequency === f.value ? undefined : () => void save({ field: "notifFrequency", value: f.value })}
              disabled={!!pending || !profile}
              last={i === FREQUENCIES.length - 1}
            />
          ))}
        </View>
        <Text style={styles.footnote}>
          At most one a day, around 10am, and only when there's something worth bringing back.
        </Text>

        <SectionLabel style={[styles.groupLabel, styles.groupLabelSpaced]}>From friends</SectionLabel>
        <View style={styles.list}>
          {toggle("notifSocial", "Shares and new friends", "When someone shares a moment with you or adds you")}
          {toggle("notifQuietHours", "Quiet at night", "From 10pm to 8am they arrive silently", {
            disabled: value("notifSocial") === false,
            last: true,
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
    },
    blocked: {
      marginBottom: theme.spacing["3xl"],
    },
    groupLabel: {
      marginBottom: theme.spacing.xs,
    },
    groupLabelSpaced: {
      marginTop: theme.spacing["3xl"],
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    footnote: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
  });
}
