import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/components/TabBar";

// Tabs with the bar at the bottom and no pager underneath (2026-11-20).
//
// Until 1.4.1 the tabs were Expo Router's TopTabs (a native pager) so a swipe
// moved between them. Swiping between tabs went away with the three-tab
// layout, and each tab gained its own Yours / Shared pager
// (components/PaneSwitcher), which left a native pager nested in a native
// pager: on a phone the outer one could lose its page position and show a
// blank Journal (no header, only the tab bar and +) after switching tabs.
// Plain tabs do the same job with nothing to scroll.
//
// lazy: Albums and Rediscover don't mount (and run their queries) behind the
// Journal at cold start; TabBar preloads them once startup settles.
export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, lazy: true }}>
      {/* 2026-11-20: Journal | Albums | Rediscover. You is a pushed screen
          (app/you.tsx) opened from the avatar on the Journal header. Route
          names stay stable so deep links and pushes keep working: /albums
          lands on the Albums tab. */}
      <Tabs.Screen name="index" options={{ title: "Journal" }} />
      <Tabs.Screen name="albums" options={{ title: "Albums" }} />
      <Tabs.Screen name="reflections" options={{ title: "Rediscover" }} />
    </Tabs>
  );
}
