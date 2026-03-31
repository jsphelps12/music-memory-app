import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Ionicons } from "@expo/vector-icons";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPendingRequests, fetchTaggedMomentsInbox } from "@/lib/friends";

const { Navigator } = createMaterialTopTabNavigator();
const SwipeTabs = withLayoutContext(Navigator);

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

function FriendsTabIcon({ color }: { color: string }) {
  const [pendingCount, setPendingCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadCount() {
      try {
        const [requests, inbox] = await Promise.all([
          fetchPendingRequests(user!.id),
          fetchTaggedMomentsInbox(user!.id),
        ]);
        if (!cancelled) {
          setPendingCount(requests.length + inbox.length);
        }
      } catch {}
    }

    loadCount();
    const interval = setInterval(loadCount, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.id]);

  return (
    <View>
      <Ionicons name="people-outline" size={24} color={color} style={{ marginBottom: -3 }} />
      {pendingCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingCount > 9 ? "9+" : pendingCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: "700",
    lineHeight: 12,
  },
});

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SwipeTabs
      tabBarPosition="bottom"
      screenOptions={{
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.tabBarBorder,
          paddingBottom: insets.bottom,
          height: 49 + insets.bottom,
        },
        tabBarIndicatorStyle: { height: 0 },
        tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 6 },
      }}
    >
      <SwipeTabs.Screen
        name="index"
        options={{
          title: "Moments",
          tabBarIcon: ({ color }) => <TabBarIcon name="music" color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="reflections"
        options={{
          title: "Reflections",
          tabBarIcon: ({ color }) => <TabBarIcon name="star" color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => <FriendsTabIcon color={color} />,
        }}
      />
      <SwipeTabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </SwipeTabs>
  );
}
