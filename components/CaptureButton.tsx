import { useMemo } from "react";
import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  onPress: () => void;
  /** Hold: a Medium haptic first, as the tab bar's + gives. */
  onLongPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Where it floats (position, offsets). The look is fixed. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The capture +: a 60pt ink circle with the Float shadow (DESIGN.md,
 * "Capture"). The same look, size, icon and touch feel as the tab bar's +
 * (components/TabBar.tsx), for screens outside the tabs that capture into
 * something (an album). The host positions it, clear of the safe area.
 */
export function CaptureButton({
  onPress,
  onLongPress,
  testID,
  accessibilityLabel = "Capture a song",
  accessibilityHint,
  style,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      activeOpacity={0.85}
      style={[styles.capture, style]}
    >
      <Icon name="add" size={28} color={theme.colors.buttonText} fixedSize />
    </TouchableOpacity>
  );
}

// Kept in step with TabBar's `capture` style.
function createStyles(theme: Theme) {
  return StyleSheet.create({
    capture: {
      width: 60,
      height: 60,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
      // Float (DESIGN.md, Shadow Vocabulary).
      shadowColor: "#0E0B0A",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.5 : 0.2,
      shadowRadius: 12,
      elevation: 8,
      zIndex: 10,
    },
  });
}
