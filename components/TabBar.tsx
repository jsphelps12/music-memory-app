import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { fetchPendingRequests } from "@/lib/friends";
import { fetchSharedCollectionActivity, fetchPendingCollectionInvites } from "@/lib/collections";
import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";

async function fetchFriendsBadgeCount(userId: string): Promise<number> {
  const [requests, collections, invites] = await Promise.all([
    fetchPendingRequests(userId),
    fetchSharedCollectionActivity(userId),
    fetchPendingCollectionInvites(userId).catch(() => []),
  ]);
  const newCollectionMoments = collections.reduce((sum, c) => sum + c.newMomentCount, 0);
  return requests.length + newCollectionMoments + invites.length;
}

// Visual tab order: Timeline(0), Browse(1), [Capture], Shared(2), Me(3)
const TAB_DEFS = [
  { label: "Moments", realIndex: 0 },
  { label: "Browse",  realIndex: 1 },
  { label: "CAPTURE", realIndex: -1 }, // action button
  { label: "Shared",  realIndex: 2 },
  { label: "Me",      realIndex: 3 },
];

function TabIcon({ name, color }: { name: string; color: string }) {
  return <Ionicons name={name as any} size={22} color={color} />;
}

const ICONS: Record<number, { active: string; inactive: string }> = {
  0: { active: "musical-notes",         inactive: "musical-notes-outline" },
  1: { active: "compass",               inactive: "compass-outline" },
  3: { active: "people",                inactive: "people-outline" },
  4: { active: "person",                inactive: "person-outline" },
};

export function TabBar({ state, navigation }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: badgeCount = 0 } = useQuery({
    queryKey: ["friendsBadge", user?.id],
    queryFn: () => fetchFriendsBadgeCount(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const barHeight = 49 + insets.bottom;

  return (
    <View style={[
      styles.bar,
      {
        height: barHeight,
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.tabBar,
        borderTopColor: theme.colors.tabBarBorder,
      },
    ]}>
      {TAB_DEFS.map((tab, visualIndex) => {
        if (tab.realIndex === -1) {
          // Center capture button
          return (
            <View key="capture" style={styles.slot}>
              <TouchableOpacity
                onPress={() => router.push("/create")}
                activeOpacity={0.85}
                style={[styles.captureWrapper, { borderColor: theme.colors.tabBar }]}
              >
                <LinearGradient
                  colors={["#E8825C", "#6B5F8C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.captureButton}
                >
                  <Ionicons name="add" size={28} color="#fff" strokeWidth={2.2} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        }

        const isActive = state.index === tab.realIndex;
        const color = isActive ? theme.colors.tabBarActive : theme.colors.tabBarInactive;
        const iconDef = ICONS[visualIndex];
        const iconName = isActive ? iconDef.active : iconDef.inactive;
        const showBadge = tab.label === "Shared" && badgeCount > 0;

        return (
          <TouchableOpacity
            key={tab.label}
            style={styles.slot}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: state.routes[tab.realIndex].key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(state.routes[tab.realIndex].name);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <TabIcon name={iconName} color={color} />
              {showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  captureWrapper: {
    marginTop: -22,
    borderWidth: 3,
    borderRadius: 999,
    shadowColor: "#E8825C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  captureButton: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    position: "relative",
    marginBottom: 3,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E8825C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    lineHeight: 12,
  },
  label: {
    fontSize: 10,
    fontFamily: "DMSans_600SemiBold",
    letterSpacing: 0.2,
  },
});
