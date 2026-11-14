import { ReactNode, useMemo } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconButton } from "@/components/IconButton";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  title?: string;
  /** A Meta line under the title, e.g. "8 entries since November". */
  subtitle?: string;
  /**
   * back: a chevron for pushed screens (swipe-back works too).
   * close: an ✕ for screens presented as a full-screen task (writer, join).
   * none: top-level tab screens.
   */
  leading?: "back" | "close" | "none";
  /** Overrides router.back() for the leading control. */
  onLeadingPress?: () => void;
  /** Actions on the right of the bar: IconButtons or a pill/text Button. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The top of a screen (DESIGN.md, Layout): a bar for the leading control and
 * actions, then the title as a large serif Headline under it, left-aligned
 * at the page gutter. Insets come from the safe area, never a fixed 60.
 */
export function ScreenHeader({
  title,
  subtitle,
  leading = "back",
  onLeadingPress,
  right,
  style,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const showBar = leading !== "none" || !!right;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (showBar ? 0 : theme.spacing.lg) }, style]}>
      {showBar ? (
        <View style={styles.bar}>
          {leading === "none" ? (
            <View />
          ) : (
            <IconButton
              name={leading === "back" ? "chevron-back" : "close"}
              onPress={onLeadingPress ?? (() => router.back())}
              accessibilityLabel={leading === "back" ? "Back" : "Close"}
              style={styles.leading}
            />
          )}
          <View style={styles.right}>{right}</View>
        </View>
      ) : null}
      {title ? (
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 44,
    },
    // The chevron's glyph sits optically at the gutter, not its 44pt box.
    leading: {
      marginLeft: -12,
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginRight: -8,
    },
    title: {
      ...theme.typography.headline,
      color: theme.colors.text,
      marginTop: theme.spacing.xs,
    },
    subtitle: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
  });
}
