import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { fetchSharedAlbumActivity } from "@/lib/albums";
import { MiniPlayer } from "@/components/MiniPlayer";

async function fetchAlbumsBadgeCount(userId: string): Promise<number> {
  const albums = await fetchSharedAlbumActivity(userId);
  return albums.reduce((sum, c) => sum + c.newMomentCount, 0);
}

// Phase 1 (2026-10): three tabs plus a floating capture button. Albums,
// shared-with-you and friends live under You, so the shared-album activity
// badge moved there with them.
const TABS = [
  { label: "Journal",    icon: "book" },
  { label: "Rediscover", icon: "time" },
  { label: "You",        icon: "person" },
] as const;

export function TabBar({ state, navigation }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: albumsBadge = 0 } = useQuery({
    queryKey: ["collectionsBadge", user?.id],
    queryFn: () => fetchAlbumsBadgeCount(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  return (
    <View style={styles.container}>
      {/* Above the bar and the mini player: it sits at the top of this
          container, so it rises when the mini player appears. */}
      <TouchableOpacity
        testID="tab-create"
        accessibilityRole="button"
        accessibilityLabel="Capture a song"
        onPress={() => router.push("/create")}
        activeOpacity={0.85}
        style={styles.capture}
      >
        <Ionicons name="add" size={28} color={theme.colors.buttonText} />
      </TouchableOpacity>

      <MiniPlayer />
      <View style={[styles.bar, { height: 49 + insets.bottom, paddingBottom: insets.bottom }]}>
        {TABS.map((tab, index) => {
          const route = state.routes[index];
          if (!route) return null;
          const isActive = state.index === index;
          const color = isActive ? theme.colors.tabBarActive : theme.colors.tabBarInactive;
          const badgeCount = tab.label === "You" ? albumsBadge : 0;

          return (
            <TouchableOpacity
              key={tab.label}
              style={styles.slot}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={badgeCount > 0 ? `${tab.label}, ${badgeCount} new` : tab.label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isActive && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={(isActive ? tab.icon : `${tab.icon}-outline`) as keyof typeof Ionicons.glyphMap}
                  size={23}
                  color={color}
                />
                {badgeCount > 0 && <View style={styles.badge} />}
              </View>
              <Text style={[styles.label, { color }, isActive && styles.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.colors.tabBar,
    },
    capture: {
      position: "absolute",
      right: theme.spacing.xl,
      top: -76,
      width: 60,
      height: 60,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.isDark ? 0.5 : 0.2,
      shadowRadius: 12,
      elevation: 8,
      zIndex: 10,
    },
    bar: {
      flexDirection: "row",
      alignItems: "stretch",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.tabBarBorder,
    },
    slot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 6,
    },
    iconWrapper: {
      position: "relative",
      marginBottom: 3,
    },
    // A dot, not a count: "something new" is the signal; the number lives on
    // the screen it belongs to.
    badge: {
      position: "absolute",
      top: -1,
      right: -5,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    label: {
      fontSize: 11,
      fontFamily: theme.fonts.bodyMedium,
      letterSpacing: 0.1,
    },
    labelActive: {
      fontFamily: theme.fonts.bodySemibold,
    },
  });
}
