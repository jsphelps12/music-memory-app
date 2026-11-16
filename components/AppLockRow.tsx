import { useState } from "react";
import { Switch } from "react-native";
import { usePostHog } from "posthog-react-native";
import { ListRow } from "@/components/ListRow";
import { useAppLock } from "@/contexts/AppLockContext";
import { useTheme } from "@/hooks/useTheme";

/**
 * Settings → Privacy → Lock with Face ID (1.4). Switching it either way asks
 * for Face ID first, so someone holding an unlocked phone can't turn it off.
 */
export function AppLockRow({ last = false }: { last?: boolean }) {
  const theme = useTheme();
  const posthog = usePostHog();
  const { enabled, methodLabel, setEnabled } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (value: boolean) => {
    setBusy(true);
    setMessage(null);
    const r = await setEnabled(value);
    setBusy(false);
    if (r.ok) posthog?.capture(value ? "app_lock_enabled" : "app_lock_disabled");
    else setMessage(r.message);
  };

  const label = `Lock with ${methodLabel}`;
  return (
    <ListRow
      label={label}
      subtitle={message ?? "Asks again after a minute away. Quick trips to your music app don't count."}
      subtitleLines={3}
      last={last}
      trailing={
        <Switch
          value={!!enabled}
          onValueChange={toggle}
          disabled={busy || enabled === null}
          trackColor={{ false: theme.colors.border, true: theme.colors.switchOn }}
          ios_backgroundColor={theme.colors.border}
          accessibilityLabel={label}
        />
      }
    />
  );
}
