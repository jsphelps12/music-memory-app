import { useCallback, useEffect } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { handleAuthDeepLink } from "@/lib/auth-linking";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";

// Prefix written to clipboard on web when user taps "Download" from an invite link.
// App reads this on first launch to recover the invite code (deferred deep link).
const CLIPBOARD_INVITE_PREFIX = "soundtracks-invite:";

export async function checkClipboardForInvite(): Promise<string | null> {
  try {
    const text = await Clipboard.getStringAsync();
    if (text.startsWith(CLIPBOARD_INVITE_PREFIX)) {
      const code = text.replace(CLIPBOARD_INVITE_PREFIX, "").trim();
      await Clipboard.setStringAsync(""); // clear so it doesn't fire again
      return code || null;
    }
  } catch {}
  return null;
}

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
    // Join link: soundtracks://join?inviteCode={code}
    const joinMatch = url.match(/^soundtracks:\/\/join\?inviteCode=([a-zA-Z0-9]+)/);
    if (joinMatch) {
      await handleInviteCode(joinMatch[1]);
      return;
    }

    // Auth deep link (email confirmation, PKCE)
    handleAuthDeepLink(url);
  }, [handleInviteCode]);

  // Clipboard check — deferred deep link fallback for cold installs via web invite page
  useEffect(() => {
    checkClipboardForInvite().then((code) => {
      if (code) handleInviteCode(code);
    });
  }, [handleInviteCode]);

  // URI scheme deep links — app already installed
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
