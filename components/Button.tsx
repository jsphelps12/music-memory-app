import { ReactNode, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

type Variant = "primary" | "secondary" | "destructive" | "text";
type Size = "large" | "pill";

interface Props {
  label: string;
  onPress: () => void;
  /**
   * primary: ink fill, the one main action on a view.
   * secondary: quiet chip-paper fill, for a second action beside a primary.
   * destructive: a delete/leave confirmation.
   * text: no fill, for Done / Cancel / Edit and inline actions.
   */
  variant?: Variant;
  /** large: full-width, 52pt, 14 radius. pill: compact header/inline action. */
  size?: Size;
  /** Text buttons only: secondary dims a Cancel; destructive reads red. */
  tone?: "default" | "secondary" | "destructive";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  disabled?: boolean;
  /** large buttons stretch by default; set false for a hugging width. */
  fullWidth?: boolean;
  /**
   * Where a hugging button sits on its parent's cross axis. "start" (default)
   * is left in a column; in a row, pass "center" so it lines up with the
   * row's other content instead of sitting at the top.
   */
  align?: "start" | "center" | "end";
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Rare: content after the label, e.g. a count. */
  trailing?: ReactNode;
}

/**
 * The app's one button (DESIGN.md, Components > Buttons). Ink, never
 * terracotta: the accent is a signal, not a fill.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "large",
  tone = "default",
  icon,
  loading = false,
  disabled = false,
  fullWidth,
  align = "start",
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
  trailing,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const inactive = disabled || loading;
  const isText = variant === "text";
  const stretch = fullWidth ?? (size === "large" && !isText);

  const fg = (() => {
    if (variant === "primary") return theme.colors.buttonText;
    if (variant === "destructive") return theme.colors.background;
    if (variant === "secondary") return theme.colors.text;
    if (tone === "destructive") return theme.colors.destructive;
    if (tone === "secondary") return theme.colors.textSecondary;
    return theme.colors.text;
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={isText ? 8 : 0}
      style={({ pressed }) => [
        styles.base,
        size === "large" ? styles.large : styles.pill,
        isText && styles.textBase,
        variant === "primary" && { backgroundColor: theme.colors.buttonBg },
        variant === "secondary" && { backgroundColor: theme.colors.chipBg },
        variant === "destructive" && { backgroundColor: theme.colors.destructive },
        stretch ? styles.stretch : align === "center" ? styles.hugCenter : align === "end" ? styles.hugEnd : styles.hug,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        // Button-embedded spinners take the label color (DESIGN.md).
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === "large" ? 18 : 16} color={fg} /> : null}
          <Text
            style={[size === "large" ? styles.labelLarge : styles.labelPill, { color: fg }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailing}
        </View>
      )}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      alignItems: "center",
      justifyContent: "center",
    },
    large: {
      minHeight: 52,
      paddingHorizontal: theme.spacing["2xl"],
      borderRadius: theme.radii.button,
    },
    pill: {
      minHeight: 36,
      paddingHorizontal: 18,
      borderRadius: theme.radii.full,
    },
    textBase: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.xs,
    },
    stretch: { alignSelf: "stretch" },
    hug: { alignSelf: "flex-start" },
    hugCenter: { alignSelf: "center" },
    hugEnd: { alignSelf: "flex-end" },
    inactive: { opacity: 0.6 },
    pressed: { opacity: 0.75 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    labelLarge: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.base,
    },
    labelPill: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.callout,
    },
  });
}
