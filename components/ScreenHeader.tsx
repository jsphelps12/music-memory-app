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
  // Top-level (tab) screens: the title and its actions share one row, so
  // every tab's title lands at the same height whether or not it has actions.
  if (leading === "none") {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + theme.spacing.sm }, style]}>
        <View style={styles.inlineRow}>
          {title ? (
            // Capped: an inline title shares its row with the actions, so at
            // the largest accessibility sizes it truncated to "Jou…".
            <Text
              style={[styles.title, styles.inlineTitle]}
              accessibilityRole="header"
              numberOfLines={1}
              maxFontSizeMultiplier={1.5}
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }, style]}>
      <View style={styles.bar}>
        <IconButton
          name={leading === "back" ? "chevron-back" : "close"}
          onPress={onLeadingPress ?? (() => router.back())}
          accessibilityLabel={leading === "back" ? "Back" : "Close"}
          testID="header-leading"
          style={styles.leading}
        />
        <View style={styles.right}>{right}</View>
      </View>
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
    },
    inlineRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      gap: theme.spacing.md,
    },
    inlineTitle: {
      marginTop: 0,
      flexShrink: 1,
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
