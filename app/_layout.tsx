import "../wdyr";
import * as Sentry from "@sentry/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import {
  DMSerifDisplay_400Regular,
  DMSerifDisplay_400Regular_Italic,
} from "@expo-google-fonts/dm-serif-display";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { Newsreader_400Regular, Newsreader_500Medium } from "@expo-google-fonts/newsreader";
import { Stack, useRouter, useSegments, usePathname, useGlobalSearchParams } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { resolveAuthRoute, ROUTE_TABS } from "@/lib/authRouting";
import { markStartup, reportStartup } from "@/lib/perf";
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-react-native";
import { posthog } from "@/lib/posthog";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-reanimated";
import * as Notifications from "expo-notifications";

import { ShareIntentProvider } from "expo-share-intent";

import { useColorScheme } from "@/components/useColorScheme";
import { ConfirmSheetHost } from "@/components/ConfirmSheet";
import { UpdateRequiredScreen } from "@/components/UpdateRequiredScreen";
import { checkUpdateRequired } from "@/lib/minBuildGate";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { useDeepLinkHandler, PENDING_INVITE_CODE_KEY } from "@/hooks/useDeepLinkHandler";
import { useShareIntentHandler } from "@/hooks/useShareIntentHandler";
import { useOtaUpdate } from "@/hooks/useOtaUpdate";
import { registerForPushNotifications } from "@/lib/notifications";

const HAS_LAUNCHED_KEY = "has_launched";

// Notification taps already routed in this process (request identifiers).
const handledNotificationIds = new Set<string>();

export { ErrorBoundary } from "expo-router";

// __DEV__ guard: without it, every local `expo run:ios` (including agent
// worktree runs) reports into Sentry tagged environment "production" (the
// APP_ENV fallback below), polluting real crash data with dev-machine noise.
if (!__DEV__) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    debug: false,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? "production",
    tracesSampleRate: 0.1,   // capture 10% of transactions for performance monitoring
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,
  });
}

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();
// Fade out of the launch screen instead of cutting, so a cold launch (from a
// widget, a push, a share) eases into wherever the app lands.
SplashScreen.setOptions({ duration: 250, fade: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
    },
  },
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, profileReady, profileError } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [hasLaunched, setHasLaunched] = useState<boolean | null>(null);

  // Escape hatch for the blocking overlay. Every wait below is individually
  // bounded, but a bug or a pathological network shouldn't be able to leave the
  // user staring at a featureless rectangle forever — after this we render
  // whatever we have and let the screens show their own loading/error states.
  const [overlayExpired, setOverlayExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOverlayExpired(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LAUNCHED_KEY)
      .then((launched) => setHasLaunched(launched === "true"))
      // A rejected read (corrupt storage, disk pressure on first launch) used to
      // leave hasLaunched === null forever, which pinned the overlay up and
      // blocked all routing. Treat failure as "not launched before".
      .catch(() => setHasLaunched(false));
  }, []);

  // The routing decision itself is the pure, tested resolveAuthRoute
  // (lib/authRouting.ts). This effect only carries out its side effects.
  const route = resolveAuthRoute({
    session,
    loading,
    profileReady,
    profileError,
    onboardingCompleted: profile?.onboardingCompleted,
    hasLaunched,
    segments,
  });

  useEffect(() => {
    if (route.showOverlay) return;

    if (route.writeHasLaunched) {
      AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
      setHasLaunched(true);
    }
    if (!route.redirect) return;

    if (route.redirect === ROUTE_TABS && session && segments[0] === "(auth)") {
      // An existing user signing in from the auth group already has moments:
      // don't show them the first-moment celebration. (Not when arriving from
      // onboarding: a new user should see it after their first moment.)
      AsyncStorage.getItem(`first_moment_saved_${session.user.id}`).then((v) => {
        if (!v) AsyncStorage.setItem(`first_moment_saved_${session.user.id}`, "true");
      });
    }

    if (route.redirect === ROUTE_TABS) {
      // The .catch matters: this read gates the navigation below, so a
      // rejected read used to leave a signed-in user stuck on the auth screen
      // with no retry.
      AsyncStorage.getItem(PENDING_INVITE_CODE_KEY)
        .then((code) => {
          AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY).catch(() => {});
          router.replace("/(tabs)");
          if (code) {
            setTimeout(() => router.push({ pathname: "/join" as any, params: { inviteCode: code } }), 300);
          }
        })
        .catch(() => router.replace("/(tabs)"));
      return;
    }

    router.replace(route.redirect as any);
  }, [route.redirect, route.showOverlay, route.writeHasLaunched, session, segments, router]);

  // Keep children always mounted so the navigation Stack is never torn down.
  // An opaque overlay covers everything during the loading window, preventing
  // any flash of the wrong screen (e.g. welcome) before routing resolves.
  const isBlocking = !overlayExpired && route.showOverlay;
  const bg = colorScheme === "dark" ? "#0E0B0A" : "#FBF7F2";

  // One continuous launch: the native launch screen stays up until we know
  // where we're going (auth resolved, profile ready, route chosen), then fades
  // straight into it. It used to hide when fonts loaded, which put a blank
  // spinner screen between the logo and the first real screen on every cold
  // start. The overlay below stays as the cover once the 12s escape hatch or
  // a slow profile fetch is involved.
  useEffect(() => {
    if (isBlocking) return;
    markStartup("gate_resolved");
    // A frame for the routed screen to paint before the launch screen lifts.
    const id = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
      reportStartup((event, props) => posthog.capture(event, props), {
        signed_in: !!session,
        entry: segments[0] ?? null,
        overlay_expired: overlayExpired,
      });
    });
    return () => cancelAnimationFrame(id);
    // Startup reports once; the latest session/segments at that moment are what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBlocking]);

  return (
    <>
      {children}
      {isBlocking && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* The splash hides as soon as fonts load, so without this the user
              stares at a featureless rectangle while auth resolves and assumes
              the app is broken. */}
          <ActivityIndicator color={colorScheme === "dark" ? "#8A8A8E" : "#6E6E73"} />
        </View>
      )}
    </>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    DMSerifDisplay_400Regular,
    DMSerifDisplay_400Regular_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Newsreader_400Regular,
    Newsreader_500Medium,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) markStartup("fonts_loaded");
  }, [loaded]);

  // The providers mount before the fonts finish loading, so session restore,
  // the profile cache read and the timeline prefetch (all started by
  // AuthProvider) overlap the font load instead of waiting for it. Only the
  // UI waits; the launch screen stays up until AuthGate resolves anyway.
  return (
    <QueryClientProvider client={queryClient}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <PostHogProvider client={posthog} autocapture={{ captureScreens: false, captureTouches: true }}>
        <ShareIntentProvider>
          <AuthProvider>
            <PlayerProvider>
              {loaded ? <RootLayoutNav /> : null}
            </PlayerProvider>
          </AuthProvider>
        </ShareIntentProvider>
      </PostHogProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user, profile } = useAuth();
  useDeepLinkHandler();
  useShareIntentHandler();
  useOtaUpdate();

  // Min-build gate (build 23): one launch check; fail-open, so the app renders
  // normally unless the server positively says this binary is below the floor.
  const [updateRequired, setUpdateRequired] = useState(false);
  useEffect(() => {
    checkUpdateRequired().then(setUpdateRequired).catch(() => {});
  }, []);

  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthog.screen(pathname, { previous_screen: previousPathname.current ?? null, ...params });
      previousPathname.current = pathname;
    }
  }, [pathname, params]);

  useEffect(() => {
    if (!user || !profile?.onboardingCompleted) return;
    // Register on every launch when permission is already granted, so a token
    // that changed, or permission turned on later in iOS Settings, always
    // reaches the profile. Only ASKING is gated on the first-moment flag: for
    // brand-new users the celebration screen owns the permission request, so
    // the iOS dialog appears in context, not immediately after onboarding.
    AsyncStorage.getItem(`first_moment_saved_${user.id}`).then((saved) => {
      registerForPushNotifications(user.id, { mayAsk: !!saved }).catch((err) => {
        Sentry.captureException(err);
        if (__DEV__) console.warn("[push-notifications] registration failed:", err);
      });
    });

    function handleNotificationData(data: Record<string, any> | undefined) {
      if (!data) return;
      if (data.type === "people") {
        // friend_added (Sharing v2): someone opened your friend link
        router.push("/friends-list" as any);
      } else if (data.type === "shared_moment" && data.momentId) {
        // share_received (Sharing v2): straight to the moment
        router.push(`/moment/${data.momentId}`);
      } else if (data.type === "friends") {
        // Legacy pushes from pre-v2 binaries: the old Friends tab became Albums,
        // now a screen pushed from You
        router.push("/albums" as any);
      } else if (data.momentId) {
        router.push(`/moment/${data.momentId}`);
      } else if (data.type === "create") {
        router.push("/create");
      } else if (data.type === "tabs") {
        router.replace("/(tabs)");
      }
    }

    // getLastNotificationResponseAsync keeps returning the same tap for the
    // whole process, and this effect re-runs on sign-in/out and onboarding
    // changes, so each tap is handled once (and never for the next account).
    function handleResponseOnce(response: Notifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      if (handledNotificationIds.has(id)) return;
      handledNotificationIds.add(id);
      handleNotificationData(
        response.notification.request.content.data as Record<string, any> | undefined
      );
    }

    // Handle tap when app was cold-launched from a notification.
    // Delay to let AuthGate finish routing to /(tabs) before we push on top.
    let coldStartTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || cancelled) return;
        coldStartTimer = setTimeout(() => handleResponseOnce(response), 600);
      })
      .catch(() => {});

    // Handle tap when app is foregrounded or backgrounded
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponseOnce);
    return () => {
      cancelled = true;
      if (coldStartTimer) clearTimeout(coldStartTimer);
      sub.remove();
    };
  }, [user?.id, profile?.onboardingCompleted]);

  if (updateRequired) {
    return (
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <UpdateRequiredScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colorScheme === "dark" ? "#0E0B0A" : "#FBF7F2" } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="celebration" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="create"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="song-search"
            // fullScreenModal, not "modal": pageSheet-style cards that cover
            // most of the parent screen are banned (see CLAUDE.md conventions)
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="moment/[id]"
            options={{
              headerShown: false,
              presentation: "transparentModal",
              animation: "none",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen
            name="moment/edit/[id]"
            options={{ headerShown: false, animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="artist"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="song"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="album"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="help"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="profile-edit"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="join"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="friends-list"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="friend/[token]"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="m/[token]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="album/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="albums"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="shared"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="write"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="browse"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="moments-map"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack>
      </AuthGate>
      {/* One host for every confirmSheet() call — renders above open sheets */}
      <ConfirmSheetHost />
    </ThemeProvider>
  );
}
