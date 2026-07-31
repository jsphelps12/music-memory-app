import "../wdyr";
import * as Sentry from "@sentry/react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
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
import { Stack, useRouter, useSegments, usePathname, useGlobalSearchParams } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
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
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { useDeepLinkHandler, PENDING_INVITE_CODE_KEY } from "@/hooks/useDeepLinkHandler";
import { useShareIntentHandler } from "@/hooks/useShareIntentHandler";
import { useOtaUpdate } from "@/hooks/useOtaUpdate";
import { registerForPushNotifications } from "@/lib/notifications";

const HAS_LAUNCHED_KEY = "has_launched";

export { ErrorBoundary } from "expo-router";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: false,
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? "production",
  tracesSampleRate: 0.1,   // capture 10% of transactions for performance monitoring
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30_000,
});

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    // Wait until auth load is done and (if logged in) profile has been fetched
    if (loading || hasLaunched === null) return;
    if (session && !profileReady) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    // Allow create/song-search/celebration to be open during onboarding flow
    const inOnboardingCreate = inOnboarding || segments[0] === "create" || segments[0] === "song-search" || segments[0] === "celebration";

    if (!session && !inAuthGroup) {
      if (!hasLaunched) {
        AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        setHasLaunched(true);
        router.replace("/(auth)/welcome");
      } else {
        router.replace("/(auth)/sign-in");
      }
    } else if (session && (inAuthGroup || inOnboarding)) {
      // profileError means the fetch failed, not that onboarding is incomplete —
      // routing an existing user into onboarding lets it overwrite their profile.
      if (!profile?.onboardingCompleted && !profileError) {
        // Only redirect to onboarding from the auth group — if already on onboarding,
        // do nothing. Calling replace("/onboarding") while already there remounts the
        // component and wipes all phase/step state mid-flow.
        if (!inOnboarding) {
          router.replace("/onboarding" as any);
        }
      } else {
        // Only pre-set first-moment flag for existing users signing in from the auth group.
        // Do NOT pre-set when coming from inOnboarding — that means a new user just finished
        // onboarding and should see the celebration after their first moment.
        if (inAuthGroup) {
          AsyncStorage.getItem(`first_moment_saved_${session.user.id}`).then((v) => {
            if (!v) AsyncStorage.setItem(`first_moment_saved_${session.user.id}`, "true");
          });
        }
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
      }
    } else if (session && !inAuthGroup && !inOnboardingCreate) {
      if (!profile?.onboardingCompleted && !profileError) {
        router.replace("/onboarding" as any);
      } else if (!hasLaunched) {
        // Backfill the key for users who were already signed in on first open
        // and never hit the !session path that normally writes it.
        AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        setHasLaunched(true);
      }
    }
  }, [session, loading, profileReady, profileError, hasLaunched, segments, router, profile?.onboardingCompleted]);

  // Keep children always mounted so the navigation Stack is never torn down.
  // An opaque overlay covers everything during the loading window, preventing
  // any flash of the wrong screen (e.g. welcome) before routing resolves.
  const isBlocking =
    !overlayExpired && (loading || hasLaunched === null || (session && !profileReady));
  const bg = colorScheme === "dark" ? "#000000" : "#FBF6F1";

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
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <PostHogProvider client={posthog} autocapture={{ captureScreens: false, captureTouches: true }}>
        <ShareIntentProvider>
          <AuthProvider>
            <PlayerProvider>
              <RootLayoutNav />
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
    // Only register for push notifications if the user has already been through the
    // celebration screen (i.e. has saved at least one moment). For brand-new users,
    // the celebration screen owns the permission request so the iOS dialog appears
    // in context, not immediately after onboarding.
    AsyncStorage.getItem(`first_moment_saved_${user.id}`).then((saved) => {
      if (!saved) return;
      registerForPushNotifications(user.id).catch((err) => {
        Sentry.captureException(err);
        if (__DEV__) console.warn("[push-notifications] registration failed:", err);
      });
    });

    function handleNotificationData(data: Record<string, any> | undefined) {
      if (!data) return;
      if (data.type === "friends") {
        router.push("/(tabs)/friends" as any);
      } else if (data.momentId) {
        router.push(`/moment/${data.momentId}`);
      } else if (data.type === "create") {
        router.push("/create");
      } else if (data.type === "tabs") {
        router.replace("/(tabs)");
      }
    }

    // Handle tap when app was cold-launched from a notification.
    // Delay to let AuthGate finish routing to /(tabs) before we push on top.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        setTimeout(() => {
          handleNotificationData(
            response.notification.request.content.data as Record<string, any> | undefined
          );
        }, 600);
      }
    });

    // Handle tap when app is foregrounded or backgrounded
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(
        response.notification.request.content.data as Record<string, any> | undefined
      );
    });
    return () => sub.remove();
  }, [user?.id, profile?.onboardingCompleted]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colorScheme === "dark" ? "#000" : "#FBF6F1" } }}>
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
            options={{ headerShown: false, presentation: "modal" }}
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
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="join"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="friends-list"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="friend-request"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="friend/[token]"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="album/[id]"
            options={{ headerShown: false }}
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
    </ThemeProvider>
  );
}
