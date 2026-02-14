import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export function ErrorState({ message, onRetry, onBack }: ErrorStateProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
      {onBack && (
        <TouchableOpacity style={styles.backLink} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      )}
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
      fontSize: theme.fontSize.base,
      color: theme.colors.destructive,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    retryButton: {
      backgroundColor: theme.colors.buttonBg,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing["2xl"],
      borderRadius: theme.radii.md,
      marginBottom: theme.spacing.sm,
    },
    retryButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    backLink: {
      paddingVertical: theme.spacing.sm,
    },
    backLinkText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
    },
  });
}
