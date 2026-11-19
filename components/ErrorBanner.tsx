import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

// An inline failure over content that's still on screen (a background
// refresh). A quiet hairline row with a small destructive icon; no tinted
// box, no side stripe.
export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Icon name="alert-circle-outline" size={18} color={theme.colors.destructive} />
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <View style={styles.actions}>
        {onRetry ? <Button label="Retry" variant="text" size="pill" onPress={onRetry} /> : null}
        <Button label="Dismiss" variant="text" size="pill" tone="secondary" onPress={onDismiss} />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    message: {
      ...theme.typography.body,
      flex: 1,
      fontSize: theme.fontSize.sm,
      lineHeight: 19,
      color: theme.colors.text,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
  });
}
