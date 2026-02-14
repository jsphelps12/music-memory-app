import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <View style={styles.actions}>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.destructive,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      flexDirection: "row",
      alignItems: "center",
    },
    message: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
    },
    actions: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginLeft: theme.spacing.md,
    },
    retryText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
    },
    dismissText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
  });
}
