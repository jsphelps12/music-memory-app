import FontAwesome from "@expo/vector-icons/FontAwesome";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
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
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [hasLaunched, setHasLaunched] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(HAS_LAUNCHED_KEY).then((value) => {
      setHasLaunched(value === "true");
    });
  }, []);

  useEffect(() => {
    if (loading || hasLaunched === null) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      if (!hasLaunched) {
        AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
        setHasLaunched(true);
        router.replace("/(auth)/welcome");
      } else {
        router.replace("/(auth)/sign-in");
      }
    } else if (session && inAuthGroup) {
      // Check for a pending invite code saved before the user was signed in
      AsyncStorage.getItem(PENDING_INVITE_CODE_KEY).then((code) => {
        AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
        router.replace("/(tabs)");
        if (code) {
          setTimeout(() => router.push({ pathname: "/join" as any, params: { inviteCode: code } }), 300);
        }
      });
    }
  }, [session, loading, hasLaunched, segments, router]);

  if (loading || hasLaunched === null) return null;

  return <>{children}</>;
}

export default function RootLayout() {
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
      <ShareIntentProvider>
        <AuthProvider>
          <PlayerProvider>
            <RootLayoutNav />
          </PlayerProvider>
        </AuthProvider>
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();
  useDeepLinkHandler();
  useShareIntentHandler();

  useEffect(() => {
    if (!user) return;
    registerForPushNotifications(user.id).catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (data?.momentId) {
        router.push(`/moment/${data.momentId}`);
      } else if (data?.type === "create") {
        router.push("/create");
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <AuthGate>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colorScheme === "dark" ? "#000" : "#FBF6F1" } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
