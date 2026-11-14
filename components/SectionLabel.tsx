import { ReactNode, useMemo } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  /** Written in its own case ("Shared with", "Members"), never upper-cased. */
  children: string;
  /** A count or short meta after the label, e.g. "3". */
  meta?: string;
  /** An action on the right, e.g. a text Button. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A section label inside a screen or sheet (DESIGN.md "Label"): DM Sans 600
 * at 13, sentence case. It heads a group of rows; it never sits as an
 * eyebrow above a title.
 */
export function SectionLabel({ children, meta, right, style }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label} accessibilityRole="header">
        {children}
        {meta ? <Text style={styles.meta}>{`  ${meta}`}</Text> : null}
      </Text>
      {right}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 28,
    },
    label: {
      ...theme.typography.label,
      color: theme.colors.textSecondary,
    },
    meta: {
      fontFamily: theme.fonts.body,
      color: theme.colors.textTertiary,
    },
  });
}
