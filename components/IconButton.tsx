import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  name: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  size?: number;
  color?: string;
  activeOpacity?: number;
  style?: ViewStyle;
  /**
   * "plain" (default, Phase 1): a bare ink icon in a 44pt target, which is
   * the header style. "filled": a small disc behind the icon, only for
   * buttons that float over imagery (album covers) and need it for contrast.
   */
  variant?: "plain" | "filled";
  accessibilityLabel?: string;
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
}: Props) {
  const theme = useTheme();
  const filled = variant === "filled";
  return (
    <TouchableOpacity
      style={[
        filled ? styles.filled : styles.plain,
        filled && { backgroundColor: theme.colors.closeButtonBg },
        style,
      ]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      hitSlop={filled ? 8 : 0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name={name}
        size={size ?? (filled ? 20 : 22)}
        color={color ?? (filled ? theme.colors.textSecondary : theme.colors.text)}
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
  filled: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
