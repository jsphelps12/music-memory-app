import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useOnForeground } from "@/lib/appFocus";
import { usePostHog } from "posthog-react-native";
import { ListRow } from "@/components/ListRow";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import {
  CheckInSettings,
  DEFAULT_CHECK_IN,
  describeDays,
  formatCheckInTime,
  readCheckInSettings,
  setCheckIn,
} from "@/lib/dailyCheckIn";

interface Props {
  userId: string;
  last?: boolean;
}

/** Monday first; 0 = Sunday as in Date.getDay(). */
const WEEK = [
  { day: 1, label: "M", name: "Monday" },
  { day: 2, label: "T", name: "Tuesday" },
  { day: 3, label: "W", name: "Wednesday" },
  { day: 4, label: "T", name: "Thursday" },
  { day: 5, label: "F", name: "Friday" },
  { day: 6, label: "S", name: "Saturday" },
  { day: 0, label: "S", name: "Sunday" },
];

/**
 * Settings → Notifications: the daily check-in switch, its time and its
 * days. Tapping the row (when on) opens a time picker; the day chips below
 * it pick which days to ask (at least one).
 */
export function DailyCheckInRow({ userId, last }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const [settings, setSettings] = useState<CheckInSettings>(DEFAULT_CHECK_IN);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());

  useEffect(() => {
    void readCheckInSettings(userId).then(setSettings);
  }, [userId]);

  // Back from iOS Settings with notifications allowed: drop the warning.
  useOnForeground(() => {
    if (!denied) return;
    void Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === "granted") setDenied(false);
    });
  });

  const apply = useCallback(
    async (next: CheckInSettings) => {
      setBusy(true);
      const result = await setCheckIn(userId, next);
      setSettings(result.settings);
      setDenied(result.permission === "denied");
      setBusy(false);
      posthog?.capture("daily_checkin_changed", {
        enabled: result.settings.enabled,
        hour: result.settings.hour,
        minute: result.settings.minute,
        source: "settings",
      });
    },
    [userId, posthog]
  );

  const toggle = (on: boolean) => {
    Haptics.selectionAsync();
    void apply({ ...settings, enabled: on });
  };

  const openPicker = () => {
    setDraft(new Date(2000, 0, 1, settings.hour, settings.minute));
    setPickerOpen(true);
  };

  const saveTime = () => {
    setPickerOpen(false);
    void apply({ ...settings, enabled: true, hour: draft.getHours(), minute: draft.getMinutes() });
  };

  const toggleDay = (day: number) => {
    const on = settings.days.includes(day);
    if (on && settings.days.length === 1) return; // keep at least one
    Haptics.selectionAsync();
    const days = on ? settings.days.filter((d) => d !== day) : [...settings.days, day].sort();
    setSettings({ ...settings, days }); // moves on tap; apply() confirms
    void apply({ ...settings, days });
  };

  const when = describeDays(settings.days);
  const subtitle = denied
    ? "Notifications are off for Soundtracks in iOS Settings."
    : settings.enabled
      ? `${when} at ${formatCheckInTime(settings.hour, settings.minute)}, unless you've already saved one`
      : "One question: what song did you listen to today?";
  const showDays = settings.enabled && !denied;

  return (
    <>
      <ListRow
        label="Daily check-in"
        subtitle={subtitle}
        subtitleLines={3}
        last={last && !denied && !showDays}
        onPress={settings.enabled ? openPicker : undefined}
        accessibilityHint={settings.enabled ? "Change the time" : undefined}
        trailing={
          <Switch
            value={settings.enabled}
            onValueChange={toggle}
            disabled={busy}
            trackColor={{ false: theme.colors.border, true: theme.colors.switchOn }}
            ios_backgroundColor={theme.colors.border}
            accessibilityLabel="Daily check-in"
          />
        }
      />
      {showDays ? (
        <View style={[styles.days, styles.daysDivider]} accessibilityLabel="Check-in days">
          {WEEK.map(({ day, label, name }) => {
            const selected = settings.days.includes(day);
            return (
              <Chip
                key={day}
                label={label}
                selected={selected}
                onPress={() => toggleDay(day)}
                style={styles.dayChip}
                accessibilityHint={`${name}, ${selected ? "on" : "off"}`}
              />
            );
          })}
        </View>
      ) : null}
      {denied ? (
        <ListRow
          label="Open iOS Settings"
          icon="notifications-off-outline"
          onPress={() => Linking.openSettings()}
          last={last}
        />
      ) : null}

      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Check-in time"
        headerAction="none"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.note}>When to ask what you listened to today.</Text>
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
            minuteInterval={5}
            onChange={(_e: DateTimePickerEvent, d?: Date) => {
              if (d) setDraft(d);
            }}
            themeVariant={theme.isDark ? "dark" : "light"}
            textColor={theme.colors.text}
          />
          <Button label={`Remind me at ${formatCheckInTime(draft.getHours(), draft.getMinutes())}`} onPress={saveTime} />
        </View>
      </BottomSheet>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    days: {
      flexDirection: "row",
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.md,
    },
    daysDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    dayChip: {
      flex: 1,
      paddingHorizontal: 0,
      justifyContent: "center",
    },
    sheetBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
      gap: theme.spacing.md,
    },
    note: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
    },
  });
}
