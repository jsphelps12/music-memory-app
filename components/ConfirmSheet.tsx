import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/BottomSheet";
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
// One ConfirmSheetHost is mounted in the root layout; it renders above
// everything, including other open bottom sheets (RN Modals stack).
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

let _present: Presenter | null = null;

/**
 * Resolves true when the user confirms, false on cancel or dismiss. If the
 * host isn't mounted (never happens after root layout renders), resolves
 * false — the safe answer for a destructive question.
 */
export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  if (!_present) return Promise.resolve(false);
  return _present(opts);
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

  useEffect(() => {
    _present = (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve });
        setVisible(true);
      });
    return () => {
      _present = null;
    };
  }, []);

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
    setVisible(false);
  };

  const opts = pending?.opts;

  return (
    <BottomSheet visible={visible} onClose={() => settle(false)} title={opts?.title ?? ""}>
      {opts ? (
        <View style={styles.body}>
          {opts.message ? <Text style={styles.message}>{opts.message}</Text> : null}
          <TouchableOpacity
            style={[
              styles.confirmButton,
              { backgroundColor: opts.destructive ? theme.colors.destructive : theme.colors.buttonBg },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              settle(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.confirmText, { color: opts.destructive ? "#fff" : theme.colors.buttonText }]}>
              {opts.confirmLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => settle(false)} activeOpacity={0.7}>
            <Text style={styles.cancelText}>{opts.cancelLabel ?? "Cancel"}</Text>
          </TouchableOpacity>
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
      paddingBottom: theme.spacing.sm,
    },
    message: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      lineHeight: 20,
      marginBottom: theme.spacing.lg,
    },
    confirmButton: {
      height: 50,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    cancelButton: {
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      marginTop: theme.spacing.xs,
    },
    cancelText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
  });
}
