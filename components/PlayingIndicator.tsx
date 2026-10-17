import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

/**
 * Three bouncing bars: "this song is playing". Sits over artwork, so it's
 * drawn in a fixed light color on a dim scrim (see MomentCard). With iOS
 * Reduce Motion on, the bars hold still at staggered heights.
 */
function Bar({ delay, color }: { delay: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const level = useSharedValue(0.45);

  useEffect(() => {
    if (reduceMotion) return;
    level.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }), -1, true)
    );
    return () => cancelAnimation(level);
  }, [reduceMotion, delay, level]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

export function PlayingIndicator({ color = "#FBF7F2" }: { color?: string }) {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Bar delay={0} color={color} />
      <Bar delay={180} color={color} />
      <Bar delay={360} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 16,
  },
  bar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    // Scale from the bottom edge, like a level meter.
    transformOrigin: "bottom",
  },
});
