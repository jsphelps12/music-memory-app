import * as Sentry from "@sentry/react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments, usePathname, useGlobalSearchParams } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { PostHogProvider } from "posthog-react-native";
import { posthog } from "@/lib/posthog";
import { View } from "react-native";
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
import { registerForPushNotifications } from "@/lib/notifications";

const HAS_LAUNCHED_KEY = "has_launched";

export { ErrorBoundary } from "expo-router";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  debug: false,
});

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, profileReady } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [hasLaunched, setHasLaunched] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LAUNCHED_KEY).then((launched) => {
      setHasLaunched(launched === "true");
    });
  }, []);

  useEffect(() => {
    // Wait until auth load is done and (if logged in) profile has been fetched
    if (loading || hasLaunched === null) return;
    if (session && !profileReady) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";

    if (!session && !inAuthGroup) {
      if (!hasLaunched) {
        AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        setHasLaunched(true);
        router.replace("/(auth)/welcome");
      } else {
        router.replace("/(auth)/sign-in");
      }
    } else if (session && (inAuthGroup || inOnboarding)) {
      if (!profile?.onboardingCompleted) {
        router.replace("/onboarding" as any);
      } else {
        // Only pre-set first-moment flag for existing users signing in from the auth group.
        // Do NOT pre-set when coming from inOnboarding — that means a new user just finished
        // onboarding and should see the celebration after their first moment.
        if (inAuthGroup) {
          AsyncStorage.getItem(`first_moment_saved_${session.user.id}`).then((v) => {
            if (!v) AsyncStorage.setItem(`first_moment_saved_${session.user.id}`, "true");
          });
        }
        AsyncStorage.getItem(PENDING_INVITE_CODE_KEY).then((code) => {
          AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
          router.replace("/(tabs)");
          if (code) {
            setTimeout(() => router.push({ pathname: "/join" as any, params: { inviteCode: code } }), 300);
          }
        });
      }
    } else if (session && !inAuthGroup && !inOnboarding) {
      if (!profile?.onboardingCompleted) {
        router.replace("/onboarding" as any);
      } else if (!hasLaunched) {
        // Backfill the key for users who were already signed in on first open
        // and never hit the !session path that normally writes it.
        AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        setHasLaunched(true);
      }
    }
  }, [session, loading, profileReady, hasLaunched, segments, router, profile?.onboardingCompleted]);

  // Keep children always mounted so the navigation Stack is never torn down.
  // An opaque overlay covers everything during the loading window, preventing
  // any flash of the wrong screen (e.g. welcome) before routing resolves.
  const isBlocking = loading || hasLaunched === null || (session && !profileReady);
  const bg = colorScheme === "dark" ? "#000000" : "#FBF6F1";

  return (
    <>
      {children}
      {isBlocking && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg }} />
      )}
    </>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PostHogProvider client={posthog} autocapture={{ captureScreens: false, captureTouches: true }}>
        <ShareIntentProvider>
          <AuthProvider>
            <PlayerProvider>
              <RootLayoutNav />
            </PlayerProvider>
          </AuthProvider>
        </ShareIntentProvider>
      </PostHogProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();
  useDeepLinkHandler();
  useShareIntentHandler();

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
    registerForPushNotifications(user.id).catch(() => {});

    function handleNotificationData(data: Record<string, any> | undefined) {
      if (!data) return;
      if (data.momentId) {
        router.push(`/moment/${data.momentId}`);
      } else if (data.type === "create") {
        router.push("/create");
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
            options={{ headerShown: false, presentation: "modal" }}
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
              gestureEnabled: false,
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen
            name="moment/edit/[id]"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="artist"
            options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }}
          />
          <Stack.Screen
            name="song"
            options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }}
          />
          <Stack.Screen
            name="album"
            options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }}
          />
          <Stack.Screen
            name="profile-edit"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="join"
            options={{ headerShown: false, presentation: "modal" }}
          />
        </Stack>
      </AuthGate>
    </ThemeProvider>
  );
}
