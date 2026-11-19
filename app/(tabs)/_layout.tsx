import { TopTabs } from "expo-router/js-top-tabs";
import { TabBar } from "@/components/TabBar";

// Swipeable tabs with the bar at the bottom. Expo Router 58 replaced
// withLayoutContext(createMaterialTopTabNavigator()) with TopTabs; it needs
// react-native-tab-view and react-native-pager-view installed alongside.
export default function TabLayout() {
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={(props) => <TabBar {...props} />}
      // lazy: Rediscover and You used to mount (and run ~7 queries) behind
      // the Journal at cold start. TabBar preloads them once startup settles.
      screenOptions={{ swipeEnabled: true, lazy: true }}
    >
      {/* Phase 1 (2026-10): three tabs. Route names stay as they were so
          deep links and pushes keep working; albums moved to /albums. */}
      <TopTabs.Screen name="index"       options={{ title: "Journal" }} />
      <TopTabs.Screen name="reflections" options={{ title: "Rediscover" }} />
      <TopTabs.Screen name="profile"     options={{ title: "You" }} />
    </TopTabs>
  );
}
