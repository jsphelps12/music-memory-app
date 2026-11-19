import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useIsFocused, useNavigation } from "expo-router";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { createConfirmHost, pickHost, type ConfirmHost } from "@/lib/confirmHosts";

// The styled replacement for confirm-class Alert.alert (design polish,
// 2026-08): a compact bottom sheet in the app's own voice instead of the
// system dialog. Imperative API so call sites stay as small as Alert.alert
// was:
//
//   if (await confirmSheet({ title: "Delete this moment?", message: "…",
//       confirmLabel: "Delete", destructive: true })) { …do it… }
//
// HOSTS ARE A STACK, not a singleton. The root layout mounts one host, but a
// root-level Modal cannot present while another Modal (an open BottomSheet,
// a native modal screen) is already up — iOS fails the presentation
// silently, which is exactly what the post-merge verification caught on the
// share sheet's unsend chip. So any sheet whose content calls confirmSheet()
// mounts its OWN <ConfirmSheetHost/> inside the sheet, and a native modal
// screen mounts one too: a Modal nested in the visible hierarchy presents
// fine.
//
// Which host answers (pickHost): only hosts whose screen is FOCUSED count,
// and among them the most recently mounted wins, with the root layout's host
// last. Mount order alone wasn't enough: a host stays mounted under the
// screens pushed over it (and under a transparentModal like moment detail),
// so the most recent one could be invisible, its sheet never presented, and
// the awaiting caller hung forever (the app looked frozen). A host inside a
// BottomSheet takes its screen's focus, and mounts when the sheet opens, so
// it wins while its sheet is up. The root host is always focused but ranked
// last, so it answers only when the visible screen has no host of its own.
// Error alerts and system-adjacent prompts (permissions) deliberately stay
// on Alert.alert — this is for decisions, not notices.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Mounted hosts, oldest first (lib/confirmHosts.ts picks which answers). */
const hosts: ConfirmHost<ConfirmOptions>[] = [];

/**
 * Resolves true when the user confirms, false on cancel or dismiss. If no
 * host is mounted (never happens after root layout renders), resolves
 * false — the safe answer for a destructive question.
 */
export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  const host = pickHost(hosts);
  if (!host) return Promise.resolve(false);
  return host.present(opts);
}

export function ConfirmSheetHost() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  // Keeps the sheet's content rendered during the close animation.
  const [visible, setVisible] = useState(false);
  // This host's registry entry; only touched in effects and handlers.
  const hostRef = useRef<ConfirmHost<ConfirmOptions> | null>(null);

  useEffect(() => {
    const host = createConfirmHost<ConfirmOptions>((next) => {
      setOpts(next);
      setVisible(true);
    });
    hostRef.current = host;
    hosts.push(host);
    return () => {
      const idx = hosts.indexOf(host);
      if (idx !== -1) hosts.splice(idx, 1);
      hostRef.current = null;
      // Host unmounting mid-question (its parent sheet closed) — answer the
      // caller with the safe "no" instead of leaving the promise pending.
      host.answer(false);
    };
  }, []);

  // The root layout's navigation has no parent; every screen's does. Its own
  // effect so a new navigation object never re-registers (and reorders) the
  // host.
  useEffect(() => {
    if (hostRef.current) hostRef.current.root = !navigation.getParent();
  }, [navigation]);

  // Only a focused screen's host answers. A screen that loses focus with a
  // question open (something navigated over it) answers "no" and closes it,
  // rather than leave the caller waiting on a sheet no one can see.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.focused = isFocused;
    if (!isFocused && host.answer(false)) setVisible(false);
  }, [isFocused]);

  const settle = (confirmed: boolean) => {
    hostRef.current?.answer(confirmed);
    setVisible(false);
    // Keep `opts` (the text) until the sheet has animated away; the next
    // present() replaces it.
  };

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
