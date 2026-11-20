import { TopTabs } from "expo-router/js-top-tabs";
import { TabBar } from "@/components/TabBar";

// Tabs with the bar at the bottom. Expo Router 58 replaced
// withLayoutContext(createMaterialTopTabNavigator()) with TopTabs; it needs
// react-native-tab-view and react-native-pager-view installed alongside.
export default function TabLayout() {
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={(props) => <TabBar {...props} />}
      // lazy: Albums and Rediscover used to mount (and run their queries)
      // behind the Journal at cold start. TabBar preloads them once startup
      // settles.
      // swipeEnabled false (2026-11-20): a horizontal swipe inside a tab moves
      // between Yours and Shared (components/PaneSwitcher), never between tabs.
      screenOptions={{ swipeEnabled: false, lazy: true }}
    >
      {/* 2026-11-20: Journal | Albums | Rediscover. You is a pushed screen
          (app/you.tsx) opened from the avatar on the Journal header. Route
          names stay stable so deep links and pushes keep working: /albums
          lands on the Albums tab. */}
      <TopTabs.Screen name="index"       options={{ title: "Journal" }} />
      <TopTabs.Screen name="albums"      options={{ title: "Albums" }} />
      <TopTabs.Screen name="reflections" options={{ title: "Rediscover" }} />
    </TopTabs>
  );
}
