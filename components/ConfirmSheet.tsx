import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// The styled replacement for confirm-class Alert.alert (design polish,
// 2026-08): a compact bottom sheet in the app's own voice instead of the
// system dialog. Imperative API so call sites stay as small as Alert.alert
// was:
//
//   if (await confirmSheet({ title: "Delete Moment", message: "…",
//       confirmLabel: "Delete", destructive: true })) { …do it… }
//
// HOSTS ARE A STACK, not a singleton. The root layout mounts one host, but a
// root-level Modal cannot present while another Modal (an open BottomSheet)
// is already up — iOS fails the presentation silently, which is exactly what
// the post-merge verification caught on the share sheet's unsend chip. So any
// sheet whose content calls confirmSheet() mounts its OWN <ConfirmSheetHost/>
// inside the sheet: a Modal nested in the visible Modal's hierarchy presents
// fine, and confirmSheet() always talks to the most recently mounted host.
// Error alerts and system-adjacent prompts (permissions) deliberately stay
// on Alert.alert — this is for decisions, not notices.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Presenter = (opts: ConfirmOptions) => Promise<boolean>;

const hostStack: Presenter[] = [];

/**
 * Resolves true when the user confirms, false on cancel or dismiss. If no
 * host is mounted (never happens after root layout renders), resolves
 * false — the safe answer for a destructive question.
 */
export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  const present = hostStack[hostStack.length - 1];
  if (!present) return Promise.resolve(false);
  return present(opts);
}

interface Pending {
  opts: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

export function ConfirmSheetHost() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [pending, setPending] = useState<Pending | null>(null);
  // Keeps the sheet's content rendered during the close animation.
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  useEffect(() => {
    const present: Presenter = (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve });
        setVisible(true);
      });
    hostStack.push(present);
    return () => {
      const idx = hostStack.indexOf(present);
      if (idx !== -1) hostStack.splice(idx, 1);
      // Host unmounting mid-question (its parent sheet closed) — answer the
      // caller with the safe "no" instead of leaving the promise pending.
      pendingRef.current?.resolve(false);
    };
  }, []);

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setVisible(false);
    // Keep `pending` (the text) until the sheet has animated away; the next
    // present() replaces it.
  };

  const opts = pending?.opts;

  return (
    <BottomSheet
      visible={visible}
      onClose={() => settle(false)}
      title={opts?.title ?? ""}
      headerAction="none"
    >
      {opts ? (
        <View style={styles.body}>
          {opts.message ? <Text style={styles.message}>{opts.message}</Text> : null}
          <Button
            label={opts.confirmLabel}
            variant={opts.destructive ? "destructive" : "primary"}
            testID="confirm-sheet-confirm"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              settle(true);
            }}
          />
          <Button
            label={opts.cancelLabel ?? "Cancel"}
            variant="text"
            tone="secondary"
            fullWidth
            onPress={() => settle(false)}
            testID="confirm-sheet-cancel"
            style={styles.cancel}
          />
        </View>
      ) : (
        <View />
      )}
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    message: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    cancel: {
      marginTop: theme.spacing.xs,
    },
  });
}
