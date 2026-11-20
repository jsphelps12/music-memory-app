import { useJournalSelecting } from "@/lib/journalSelecting";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { runWhenIdle, type IdleTask } from "@/lib/whenIdle";
import { CaptureMenu } from "@/components/CaptureMenu";
import { CaptureHint } from "@/components/CaptureHint";
import { captureHintSeen, markCaptureHintSeen } from "@/lib/captureHint";
import { listCaptureDrafts, type CaptureDraft } from "@/lib/captureDraft";
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

// 2026-11-20: Journal | Albums | Rediscover, and a floating capture button
// on the Journal only. The shared-album activity dot sits on Albums. You is a
// pushed screen (app/you.tsx) opened from the Journal header's avatar.
// After the cold-start burst (first_screen lands at ~0.5s, the profile fetch
// and first timeline page shortly after).
const TAB_PRELOAD_DELAY_MS = 2500;
// The hold hint: after the Journal has settled, for long enough to read.
const HINT_DELAY_MS = 1800;
const HINT_SHOW_MS = 7000;
// How far the capture button's top sits above the bar (mini player + tabs):
// 60pt button, its bottom edge 16pt above the bar.
const CAPTURE_RISE = 76;

// Route name (app/(tabs)/*) → href, for prefetching a tab not yet shown.
const TAB_HREFS: Record<string, "/" | "/albums" | "/reflections"> = {
  index: "/",
  albums: "/albums",
  reflections: "/reflections",
};

// In route order (app/(tabs)/_layout.tsx). Outline when inactive, filled when
// active (book / book.fill). Albums' rectangle.stack has no filled mapping in
// lib/iconSymbols.ts yet, and Rediscover's clock.arrow.circlepath has no
// filled form.
const TABS = [
  { label: "Journal",    icon: "book-outline",   activeIcon: "book" },
  { label: "Albums",     icon: "albums-outline", activeIcon: "albums-outline" },
  { label: "Rediscover", icon: "time-outline",   activeIcon: "time" },
] as const;

export function TabBar({ state, emitter, navigateToTab }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // Read as the menu opens, so "Continue a draft" is there from its first
  // frame rather than popping in and resizing the sheet.
  const [menuDrafts, setMenuDrafts] = useState<CaptureDraft[]>([]);
  const [hint, setHint] = useState(false);

  // The tabs are lazy (app/(tabs)/_layout.tsx), so Albums and Rediscover no
  // longer mount and fetch alongside the Journal's first paint. Once startup
  // has settled, preload them so a tap still lands on a rendered screen.
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
  const journalSelecting = useJournalSelecting();
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
    // Two layers. The bar (mini player + tabs) is laid out as it always was;
    // the capture button floats in a layer that starts CAPTURE_RISE above the
    // bar and pulls itself down by the same amount (negative margin), so the
    // screen above keeps exactly the space it had while the + lies inside its
    // parent's bounds. iOS clips an element's accessibility frame to its
    // parent: drawn outside it (top: -76 on the bar, as it was), VoiceOver's
    // focus ring and XCUITest/Maestro put the + somewhere else. box-none: only
    // the 60pt button takes touches; the rest of the band passes them through
    // to the screen underneath.
    <View style={styles.layer} pointerEvents="box-none">
      <View style={styles.container}>
        {/* Anchored to this container: a line just above the +. */}
        <CaptureHint visible={hint} onDismiss={() => setHint(false)} />
        <CaptureMenu visible={menuOpen} onClose={() => setMenuOpen(false)} drafts={menuDrafts} />

        <MiniPlayer />
        <View style={[styles.bar, { height: 49 + insets.bottom, paddingBottom: insets.bottom }]}>
          {TABS.map((tab, index) => {
            const route = state.routes[index];
            if (!route) return null;
            const isActive = state.index === index;
            const color = isActive ? theme.colors.tabBarActive : theme.colors.tabBarInactive;
            const badgeCount = tab.label === "Albums" ? albumsBadge : 0;

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

      {/* At the top of the layer, which grows with the mini player, so the +
          rises when one appears. After the bar, so it draws over it. */}
      {/* On the Journal only (2026-11-20): Albums has its own "New album",
          Rediscover none. Hidden while the Journal is selecting moments: the
          selection bar has the bottom to itself (lib/journalSelecting.ts). */}
      {!onJournal || journalSelecting ? null : (
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
            const read = user ? listCaptureDrafts(user.id) : Promise.resolve([]);
            void read.then((drafts) => {
              setMenuDrafts(drafts);
              setMenuOpen(true);
            });
          }}
          delayLongPress={350}
          activeOpacity={0.85}
          style={styles.capture}
        >
          <Icon name="add" size={28} color={theme.colors.buttonText} fixedSize />
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    // The capture button's layer: CAPTURE_RISE taller than the bar, and
    // pulled up over the screen by the same amount, so the bar's own layout
    // (and the space the screen above gets) is unchanged.
    layer: {
      marginTop: -CAPTURE_RISE,
    },
    container: {
      marginTop: CAPTURE_RISE,
      backgroundColor: theme.colors.tabBar,
    },
    capture: {
      position: "absolute",
      right: theme.spacing.xl,
      top: 0,
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
