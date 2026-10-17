import { withLayoutContext } from "expo-router";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { TabBar } from "@/components/TabBar";

const { Navigator } = createMaterialTopTabNavigator();
const SwipeTabs = withLayoutContext(Navigator);

export default function TabLayout() {
  return (
    <SwipeTabs
      tabBarPosition="bottom"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ swipeEnabled: true }}
    >
      {/* Phase 1 (2026-10): three tabs. Route names stay as they were so
          deep links and pushes keep working; albums moved to /albums. */}
      <SwipeTabs.Screen name="index"       options={{ title: "Journal" }} />
      <SwipeTabs.Screen name="reflections" options={{ title: "Rediscover" }} />
      <SwipeTabs.Screen name="profile"     options={{ title: "You" }} />
    </SwipeTabs>
  );
}
