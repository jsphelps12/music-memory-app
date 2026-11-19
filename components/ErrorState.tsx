import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
}

// A full-screen load failure. Quiet on purpose: the message in Graphite, one
// ink "Try again", and "Go back" as a text button (never terracotta).
export function ErrorState({ message, onRetry, onBack }: ErrorStateProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Icon name="cloud-offline-outline" size={32} color={theme.colors.textSecondary} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} fullWidth={false} align="center" />
      ) : null}
      {onBack ? (
        <Button label="Go back" variant="text" tone="secondary" onPress={onBack} align="center" style={styles.back} />
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    message: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xl,
      maxWidth: 320,
    },
    back: {
      marginTop: theme.spacing.xs,
    },
  });
}
