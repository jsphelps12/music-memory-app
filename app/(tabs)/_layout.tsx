import React from "react";
import { StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

const { Navigator } = createMaterialTopTabNavigator();
const SwipeTabs = withLayoutContext(Navigator);

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

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
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </SwipeTabs>
  );
}
