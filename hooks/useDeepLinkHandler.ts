import { useCallback, useEffect } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { handleAuthDeepLink } from "@/lib/auth-linking";
import branch from "react-native-branch";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";

export function useDeepLinkHandler() {
  const router = useRouter();
  const { user } = useAuth();

  const handleInviteCode = useCallback(async (inviteCode: string) => {
    if (user) {
      router.push({ pathname: "/join" as any, params: { inviteCode } });
    } else {
      await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, inviteCode);
    }
  }, [user, router]);

  const handleUrl = useCallback(async (url: string) => {
    // Join link: tracks://join?inviteCode={code}
    const joinMatch = url.match(/^tracks:\/\/join\?inviteCode=([a-zA-Z0-9]+)/);
    if (joinMatch) {
      await handleInviteCode(joinMatch[1]);
      return;
    }

    // Auth deep link (email confirmation, PKCE)
    handleAuthDeepLink(url);
  }, [handleInviteCode]);

  // Branch SDK — handles deferred deep links (cold install) and Branch universal links
  useEffect(() => {
    const unsubscribe = branch.subscribe(({ error, params }) => {
      if (error || !params) return;
      // +non_branch_link means it's a regular URI scheme link — already handled by Linking below
      if (params["+non_branch_link"]) return;
      // +clicked_branch_link is false on the initial session check when no Branch link was clicked
      if (!params["+clicked_branch_link"]) return;

      const inviteCode = params.inviteCode as string | undefined;
      if (inviteCode) {
        handleInviteCode(inviteCode);
      }
    });

    return () => unsubscribe();
  }, [handleInviteCode]);

  // Expo Linking — handles direct URI scheme deep links when app is already installed
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, [handleUrl]);
}
