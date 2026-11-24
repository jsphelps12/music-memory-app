import { useEffect, useState } from "react";
import { Switch } from "react-native";
import { ListRow } from "@/components/ListRow";
import { useAuth } from "@/contexts/AuthContext";
import { useAppLock } from "@/contexts/AppLockContext";
import { useTheme } from "@/hooks/useTheme";
import { getWidgetWords, setWidgetWords } from "@/lib/widgetSettings";
import { refreshMemoryWidget } from "@/lib/widgetData";

const LABEL = "Show my words on the widget";

/**
 * Settings → Privacy (1.5). The Memory widget shows the song and the date;
 * this adds one line of the reflection. Off by default and per account.
 * The app lock wins: with it on, the widget never shows words.
 */
export function WidgetWordsRow({ last = false }: { last?: boolean }) {
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const { enabled: lockOn, methodLabel } = useAppLock();
  const [on, setOn] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getWidgetWords(userId).then((v) => {
      if (!cancelled) setOn(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = async (value: boolean) => {
    if (!userId) return;
    setOn(value);
    setMessage(null);
    try {
      await setWidgetWords(userId, value);
      void refreshMemoryWidget({ force: true });
    } catch {
      setOn(!value);
      setMessage("Couldn't save that. Try again.");
    }
  };

  const subtitle =
    message ??
    (lockOn
      ? `Hidden while the ${methodLabel} lock is on.`
      : "A line of what you wrote, under the song. Anyone who sees your Home Screen can read it.");

  return (
    <ListRow
      label={LABEL}
      subtitle={subtitle}
      subtitleLines={3}
      last={last}
      trailing={
        <Switch
          value={!!on}
          onValueChange={toggle}
          disabled={on === null}
          trackColor={{ false: theme.colors.border, true: theme.colors.switchOn }}
          ios_backgroundColor={theme.colors.border}
          accessibilityLabel={LABEL}
        />
      }
    />
  );
}
