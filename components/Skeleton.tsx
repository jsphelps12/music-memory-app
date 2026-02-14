import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

export function Skeleton({ width, height, borderRadius = 8 }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.skeletonBase },
        animatedStyle,
      ]}
    />
  );
}

export function SkeletonTimelineCard() {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        skeletonStyles.timelineCard,
        { backgroundColor: colors.cardBg },
      ]}
    >
      <Skeleton width={56} height={56} borderRadius={8} />
      <View style={{ flex: 1, marginLeft: spacing.md, gap: spacing.sm }}>
        <Skeleton width="70%" height={14} borderRadius={4} />
        <Skeleton width="50%" height={12} borderRadius={4} />
        <Skeleton width="90%" height={12} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonMomentDetail() {
  const { spacing } = useTheme();

  return (
    <View style={[skeletonStyles.momentDetail, { padding: spacing.xl }]}>
      <Skeleton width="100%" height={300} borderRadius={12} />
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Skeleton width="60%" height={20} borderRadius={4} />
        <Skeleton width="40%" height={14} borderRadius={4} />
      </View>
      <View style={{ marginTop: spacing.xl }}>
        <Skeleton width={120} height={36} borderRadius={20} />
      </View>
      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Skeleton width="100%" height={14} borderRadius={4} />
        <Skeleton width="95%" height={14} borderRadius={4} />
        <Skeleton width="80%" height={14} borderRadius={4} />
      </View>
    </View>
  );
}

export function SkeletonProfile() {
  const { spacing } = useTheme();

  return (
    <View style={skeletonStyles.profile}>
      <Skeleton width={100} height={100} borderRadius={50} />
      <View style={{ marginTop: spacing.xl, alignItems: "center", gap: spacing.sm }}>
        <Skeleton width={140} height={18} borderRadius={4} />
        <Skeleton width={180} height={14} borderRadius={4} />
      </View>
      <View
        style={{
          flexDirection: "row",
          marginTop: spacing["3xl"],
          gap: spacing["4xl"],
        }}
      >
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Skeleton width={40} height={18} borderRadius={4} />
          <Skeleton width={60} height={12} borderRadius={4} />
        </View>
        <View style={{ alignItems: "center", gap: spacing.xs }}>
          <Skeleton width={80} height={18} borderRadius={4} />
          <Skeleton width={90} height={12} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  timelineCard: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  momentDetail: {
    paddingTop: 80,
  },
  profile: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 20,
  },
});
