import { ReactNode, useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

type Accessory = "chevron" | "check" | "expand" | "none";

interface Props {
  label: string;
  /** A second line under the label, in Graphite. */
  subtitle?: string;
  /** Lines the subtitle may wrap to (default 2). */
  subtitleLines?: number;
  /** Body Strong label, for a song title (DESIGN.md "Song Then Artist"). */
  strong?: boolean;
  /** A short value on the right, before the accessory (e.g. "Off", "0"). */
  detail?: string;
  /** Leading icon, in Graphite. */
  icon?: IconName;
  /** Leading content in place of an icon (an artwork thumbnail, an avatar). */
  leading?: ReactNode;
  /**
   * chevron: goes somewhere. check: a picked option (shown when `selected`).
   * expand: opens a section in place (needs `expanded`). none: nothing.
   * Defaults to chevron when there's an onPress, otherwise none.
   */
  accessory?: Accessory;
  selected?: boolean;
  expanded?: boolean;
  /** Custom right-side content (a Switch, a Button); replaces detail + accessory. */
  trailing?: ReactNode;
  destructive?: boolean;
  /** No bottom hairline: the last row, or one followed by its expanded body. */
  last?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The app's one list row (DESIGN.md, "Rows Not Boxes"): full width on the
 * page, a hairline in `divider` underneath, label in Body, detail in Graphite,
 * and a quiet accessory. Settings, You, Edit profile, Help and the pick-one
 * sheets all use it, so a row reads the same everywhere.
 */
export function ListRow({
  label,
  subtitle,
  subtitleLines = 2,
  strong = false,
  detail,
  icon,
  leading,
  accessory,
  selected = false,
  expanded,
  trailing,
  destructive = false,
  last = false,
  onPress,
  onLongPress,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const kind: Accessory = accessory ?? (onPress ? "chevron" : "none");
  const labelColor = destructive ? theme.colors.destructive : theme.colors.text;

  const accessoryIcon =
    kind === "chevron"
      ? "chevron-forward"
      : kind === "expand"
        ? expanded
          ? "chevron-up"
          : "chevron-down"
        : kind === "check" && selected
          ? "checkmark"
          : null;

  const body = (
    <>
      {leading ?? (icon ? (
        <Icon
          name={icon}
          size={20}
          color={destructive ? theme.colors.destructive : theme.colors.textSecondary}
          style={styles.icon}
        />
      ) : null)}
      <View style={styles.text}>
        <Text style={[styles.label, strong && styles.labelStrong, { color: labelColor }]} numberOfLines={2}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <View style={styles.right}>
          {detail ? (
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
          {accessoryIcon ? (
            <Icon
              name={accessoryIcon}
              size={kind === "check" ? 18 : 16}
              color={kind === "check" ? theme.colors.text : theme.colors.textSecondary}
            />
          ) : null}
        </View>
      )}
    </>
  );

  const rowStyle = [styles.row, !last && styles.divider, disabled && styles.disabled, style];

  if (!onPress && !onLongPress) {
    return (
      <View style={rowStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled,
        ...(kind === "check" ? { selected } : {}),
        ...(kind === "expand" ? { expanded: !!expanded } : {}),
      }}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.5 },
    icon: { width: 22, textAlign: "center" },
    text: { flex: 1, gap: 2 },
    label: {
      ...theme.typography.body,
    },
    labelStrong: {
      ...theme.typography.bodyStrong,
    },
    subtitle: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs + 2,
      flexShrink: 0,
      maxWidth: "55%",
    },
    detail: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      flexShrink: 1,
    },
  });
}
