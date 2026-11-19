import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/**
 * A one-time pointer at the capture button (1.4): long-press + is how you
 * reach Identify, Last week and From before, and nothing on screen says so.
 * A raised surface like the moment menu, with a small tail down to the
 * button. TabBar decides when it shows (once per device, lib/captureHint.ts).
 */
export function CaptureHint({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.set(withTiming(visible ? 1 : 0, { duration: visible ? 260 : 180 }));
  }, [visible, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 6 }],
  }));

  return (
    <Animated.View
      style={[styles.anchor, style]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <View style={styles.stack} pointerEvents="box-none">
        <Pressable
          onPress={onDismiss}
          style={styles.bubble}
          accessibilityRole="button"
          accessibilityLabel="Hold the plus button for more ways to start. Dismiss"
        >
          <Text style={styles.text}>
            Hold <Text style={styles.strong}>+</Text> for Last week, From before
            and more
          </Text>
        </Pressable>
        <View style={styles.tail} />
      </View>
    </Animated.View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    // A zero-height line just above the capture button. The hint sits in
    // TabBar's bar container (mini player + tabs); the 60pt button, right xl,
    // has its top CAPTURE_RISE (76) above that container's top. The bubble
    // grows up from this line, so it follows the button when the mini player
    // pushes both up.
    anchor: {
      position: "absolute",
      top: -76 - 8,
      right: theme.spacing.xl - 4,
      width: 280,
      height: 0,
      zIndex: 11,
    },
    stack: {
      position: "absolute",
      right: 0,
      bottom: 0,
      alignItems: "flex-end",
    },
    bubble: {
      maxWidth: 260,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    text: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
    },
    strong: {
      fontFamily: theme.fonts.bodySemibold,
    },
    // A rotated square under the bubble's right side, pointing at the +.
    tail: {
      width: 12,
      height: 12,
      marginTop: -6,
      marginRight: 30 + 4 - 6,
      transform: [{ rotate: "45deg" }],
      backgroundColor: theme.colors.elevated,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
  });
}
