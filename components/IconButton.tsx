import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  activeOpacity?: number;
  style?: ViewStyle;
  /**
   * "plain" (default, Phase 1): a bare ink icon in a 44pt target, which is
   * the header style. "filled": a small disc behind the icon, only for
   * small controls on a quiet ground. "glass": a 40pt frosted paper disc
   * (night in dark) with an ink icon, for controls that float over artwork, photos or a
   * map (DESIGN.md: the filled-over-imagery case).
   */
  variant?: "plain" | "filled" | "glass";
  accessibilityLabel?: string;
  /** For the Maestro flows in .maestro/. */
  testID?: string;
}

export function IconButton({
  name,
  onPress,
  size,
  color,
  activeOpacity = 0.7,
  style,
  variant = "plain",
  accessibilityLabel,
  testID,
}: Props) {
  const theme = useTheme();
  const filled = variant === "filled";
  const glass = variant === "glass";
  return (
    <TouchableOpacity
      style={[
        glass ? styles.glass : filled ? styles.filled : styles.plain,
        filled && { backgroundColor: theme.colors.fill },
        glass && { backgroundColor: theme.colors.glass },
        style,
      ]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      hitSlop={filled ? 8 : glass ? 4 : 0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Icon
        name={name}
        size={size ?? (filled || glass ? 20 : 22)}
        color={
          color ??
          (glass ? theme.colors.onGlass : filled ? theme.colors.textSecondary : theme.colors.text)
        }
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  plain: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  glass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  filled: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
