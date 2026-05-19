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
      screenOptions={{ swipeEnabled: false }}
    >
      <SwipeTabs.Screen name="index"       options={{ title: "Moments" }} />
      <SwipeTabs.Screen name="browse"      options={{ title: "Browse" }} />
      <SwipeTabs.Screen name="friends"     options={{ title: "Shared" }} />
      <SwipeTabs.Screen name="profile"     options={{ title: "Me" }} />
    </SwipeTabs>
  );
}
