import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  onPress: () => void;
  activeOpacity?: number;
  style?: ViewStyle;
}

export function CloseButton({ onPress, activeOpacity = 0.7, style }: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.colors.closeButtonBg }, style]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      hitSlop={8}
    >
      <Icon name="close" size={18} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
