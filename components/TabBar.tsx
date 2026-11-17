import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { runWhenIdle, type IdleTask } from "@/lib/whenIdle";
import { CaptureMenu } from "@/components/CaptureMenu";
import { CaptureHint } from "@/components/CaptureHint";
import { captureHintSeen, markCaptureHintSeen } from "@/lib/captureHint";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useQuery } from "@tanstack/react-query";
import type { MaterialTopTabBarProps } from "expo-router/js-top-tabs";
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
// After the cold-start burst (first_screen lands at ~0.5s, the profile fetch
// and first timeline page shortly after).
const TAB_PRELOAD_DELAY_MS = 2500;
// The hold hint: after the Journal has settled, for long enough to read.
const HINT_DELAY_MS = 1800;
const HINT_SHOW_MS = 7000;

// Route name (app/(tabs)/*) → href, for prefetching a tab not yet shown.
const TAB_HREFS: Record<string, "/" | "/reflections" | "/profile"> = {
  index: "/",
  reflections: "/reflections",
  profile: "/profile",
};

// Outline when inactive, filled when active (book / book.fill, person /
// person.fill). Rediscover's clock.arrow.circlepath has no filled form.
const TABS = [
  { label: "Journal",    icon: "book-outline",   activeIcon: "book" },
  { label: "Rediscover", icon: "time-outline",   activeIcon: "time" },
  { label: "You",        icon: "person-outline", activeIcon: "person" },
] as const;

export function TabBar({ state, emitter, navigateToTab }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState(false);

  // The tabs are lazy (app/(tabs)/_layout.tsx), so Rediscover and You no
  // longer mount and fetch alongside the Journal's first paint. Once startup
  // has settled, preload them so a swipe still lands on a rendered screen.
  // Expo Router 58's tab bar gets no navigation history, so remember which
  // tabs have been shown here; prefetch is its replacement for preload.
  const visitedRef = useRef(new Set<string>());
  const current = state.routes[state.index];
  if (current) visitedRef.current.add(current.key);
  const stateRef = useRef(state);
  stateRef.current = state;
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let task: IdleTask | null = null;
    const timer = setTimeout(() => {
      task = runWhenIdle(() => {
        // Only tabs never visited: preloading one that's mounted is pointless.
        const s = stateRef.current;
        s.routes.forEach((route, index) => {
          if (index === s.index || visitedRef.current.has(route.key)) return;
          const href = TAB_HREFS[route.name];
          if (href) router.prefetch(href);
        });
      });
    }, TAB_PRELOAD_DELAY_MS);
    return () => {
      clearTimeout(timer);
      task?.cancel();
    };
  }, [userId]);

  // "Hold + for more", once per device, on the Journal (components/CaptureHint).
  const onJournal = state.index === 0;
  useEffect(() => {
    if (!userId || !onJournal) return;
    let cancelled = false;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = setTimeout(() => {
      void captureHintSeen().then((seen) => {
        if (seen || cancelled) return;
        void markCaptureHintSeen();
        setHint(true);
        hide = setTimeout(() => setHint(false), HINT_SHOW_MS);
      });
    }, HINT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(show);
      if (hide) clearTimeout(hide);
      setHint(false);
    };
  }, [userId, onJournal]);

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
        accessibilityHint="Hold for more ways to start"
        onPress={() => {
          setHint(false);
          router.push("/create");
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setHint(false);
          void markCaptureHintSeen();
          setMenuOpen(true);
        }}
        delayLongPress={350}
        activeOpacity={0.85}
        style={styles.capture}
      >
        <Icon name="add" size={28} color={theme.colors.buttonText} fixedSize />
      </TouchableOpacity>

      <CaptureHint visible={hint} onDismiss={() => setHint(false)} />
      <CaptureMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

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
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isActive && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                {/* Fixed like iOS's own tab bars: the slot doesn't grow. */}
                <Icon
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={23}
                  color={color}
                  fixedSize
                />
                {badgeCount > 0 && <View style={styles.badge} />}
              </View>
              {/* Capped like the system tab bar, whose labels barely scale:
                  three labels must fit one row ("Rediscover" clipped at AX3). */}
              <Text style={[styles.label, { color }, isActive && styles.labelActive]} maxFontSizeMultiplier={1.2}>
                {tab.label}
              </Text>
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
      shadowColor: "#0E0B0A",
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
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot on a tab
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
