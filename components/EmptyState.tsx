import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";

interface Props {
  icon: IconName;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, subtitle, action }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <Icon name={icon} size={40} color={theme.colors.textSecondary} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} fullWidth={false} align="center" style={styles.action} />
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
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
      marginTop: theme.spacing.md,
      textAlign: "center",
    },
    subtitle: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      textAlign: "center",
      maxWidth: 320,
    },
    action: {
      marginTop: theme.spacing.xl,
    },
  });
}
