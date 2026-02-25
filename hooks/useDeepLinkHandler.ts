import { useCallback, useEffect } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { handleAuthDeepLink } from "@/lib/auth-linking";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";

export function useDeepLinkHandler() {
  const router = useRouter();
  const { user } = useAuth();

  const handleUrl = useCallback(async (url: string) => {
    // Join link: tracks://join/{invite_code}
    const joinMatch = url.match(/^tracks:\/\/join\/([a-zA-Z0-9]+)/);
    if (joinMatch) {
      const inviteCode = joinMatch[1];
      if (user) {
        router.push({ pathname: "/join" as any, params: { inviteCode } });
      } else {
        // Save for after sign-in — AuthGate will pick it up
        await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, inviteCode);
      }
      return;
    }

    // Auth deep link (email confirmation, PKCE)
    handleAuthDeepLink(url);
  }, [user, router]);

  useEffect(() => {
    // Cold start: app opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Warm start: app already running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, [handleUrl]);
}
