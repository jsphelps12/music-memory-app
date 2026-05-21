import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { fetchPendingRequests, fetchPendingTaggedMomentsCount } from "@/lib/friends";
import { fetchSharedCollectionActivity, fetchPendingCollectionInvites } from "@/lib/collections";

async function fetchCollectionsBadgeCount(userId: string): Promise<number> {
  const [collections, invites] = await Promise.all([
    fetchSharedCollectionActivity(userId),
    fetchPendingCollectionInvites(userId).catch(() => []),
  ]);
  return collections.reduce((sum, c) => sum + c.newMomentCount, 0) + invites.length;
}

async function fetchProfileBadgeCount(userId: string): Promise<number> {
  const [requests, pendingTags] = await Promise.all([
    fetchPendingRequests(userId),
    fetchPendingTaggedMomentsCount(userId),
  ]);
  return requests.length + pendingTags;
}
import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import { MiniPlayer } from "@/components/MiniPlayer";


// Visual tab order: Timeline(0), Reflections(1), [Capture], Collections(2), Me(3)
const TAB_DEFS = [
  { label: "Moments",     realIndex: 0 },
  { label: "Reflections", realIndex: 1 },
  { label: "CAPTURE",     realIndex: -1 },
  { label: "Collections", realIndex: 2 },
  { label: "Me",          realIndex: 3 },
];

const ICONS: Record<number, { active: string; inactive: string }> = {
  0: { active: "musical-notes", inactive: "musical-notes-outline" },
  1: { active: "sparkles",      inactive: "sparkles-outline" },
  3: { active: "albums",        inactive: "albums-outline" },
  4: { active: "person",        inactive: "person-outline" },
};

export function TabBar({ state, navigation }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: collectionsBadge = 0 } = useQuery({
    queryKey: ["collectionsBadge", user?.id],
    queryFn: () => fetchCollectionsBadgeCount(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: profileBadge = 0 } = useQuery({
    queryKey: ["profileBadge", user?.id],
    queryFn: () => fetchProfileBadgeCount(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const barHeight = 49 + insets.bottom;
  const activeColor = theme.colors.tabBarActive;
  const inactiveColor = theme.colors.tabBarInactive;

  return (
    <View style={{ backgroundColor: theme.colors.tabBar }}>
      <MiniPlayer />
      <View style={[
        styles.bar,
        {
          height: barHeight,
          paddingBottom: insets.bottom,
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
        const color = isActive ? activeColor : inactiveColor;
        const iconDef = ICONS[visualIndex];
        const iconName = isActive ? iconDef.active : iconDef.inactive;
        const badgeCount = tab.label === "Collections" ? collectionsBadge : tab.label === "Me" ? profileBadge : 0;
        const showBadge = badgeCount > 0;

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
              <Ionicons name={iconName as any} size={22} color={color} />
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
