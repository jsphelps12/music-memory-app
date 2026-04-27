import { useCallback, useEffect, useRef } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { handleAuthDeepLink } from "@/lib/auth-linking";
import { fetchProfileByFriendToken } from "@/lib/friends";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";
export const PENDING_FRIEND_TOKEN_KEY = "pending_friend_token";

// Prefixes written to clipboard on web for deferred deep link (cold install) fallback.
const CLIPBOARD_INVITE_PREFIX = "soundtracks-invite:";
const CLIPBOARD_FRIEND_PREFIX = "soundtracks-friend:";

export async function checkClipboardForInvite(): Promise<string | null> {
  try {
    const text = await Clipboard.getStringAsync();
    if (text.startsWith(CLIPBOARD_INVITE_PREFIX)) {
      const code = text.replace(CLIPBOARD_INVITE_PREFIX, "").trim();
      await Clipboard.setStringAsync("");
      return code || null;
    }
  } catch {}
  return null;
}

export async function checkClipboardForFriendToken(): Promise<string | null> {
  try {
    const text = await Clipboard.getStringAsync();
    if (text.startsWith(CLIPBOARD_FRIEND_PREFIX)) {
      const token = text.replace(CLIPBOARD_FRIEND_PREFIX, "").trim();
      await Clipboard.setStringAsync("");
      return token || null;
    }
  } catch {}
  return null;
}

export function useDeepLinkHandler() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // Track pending friend token so we can show FriendRequestSheet after auth
  const pendingFriendTokenRef = useRef<string | null>(null);
  // Deduplicate URL handling — getInitialURL + addEventListener both fire for same URL
  const lastHandledUrlRef = useRef<string | null>(null);
  // Prevent multiple simultaneous navigations to friend-request (URL + AsyncStorage + clipboard can all fire)
  const friendNavInFlightRef = useRef(false);

  const handleInviteCode = useCallback(async (inviteCode: string) => {
    if (user) {
      router.push({ pathname: "/join" as any, params: { inviteCode } });
    } else {
      await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, inviteCode);
    }
  }, [user, router]);

  const handleFriendToken = useCallback(async (token: string) => {
    if (user) {
      if (friendNavInFlightRef.current) return;
      friendNavInFlightRef.current = true;
      router.push({ pathname: "/friend-request" as any, params: { token } });
      // Reset after navigation settles
      setTimeout(() => { friendNavInFlightRef.current = false; }, 2000);
    } else {
      await AsyncStorage.setItem(PENDING_FRIEND_TOKEN_KEY, token);
    }
  }, [user, router]);

  const handleUrl = useCallback(async (url: string) => {
    if (lastHandledUrlRef.current === url) return;
    lastHandledUrlRef.current = url;
    // Join link: soundtracks://join?inviteCode={code}
    const joinMatch = url.match(/^soundtracks:\/\/join\?inviteCode=([a-zA-Z0-9]+)/);
    if (joinMatch) {
      await handleInviteCode(joinMatch[1]);
      return;
    }

    // Friend link: soundtracks://friend?token={token}
    const friendMatch = url.match(/^soundtracks:\/\/friend\?token=([a-zA-Z0-9-]+)/);
    if (friendMatch) {
      await handleFriendToken(friendMatch[1]);
      return;
    }

    // Auth deep link (email confirmation, PKCE)
    handleAuthDeepLink(url);
  }, [handleInviteCode, handleFriendToken]);

  // Clipboard check — deferred deep link fallback for cold installs via web invite/friend pages
  useEffect(() => {
    checkClipboardForInvite().then((code) => {
      if (code) handleInviteCode(code);
    });
    checkClipboardForFriendToken().then((token) => {
      if (token) handleFriendToken(token);
    });
  }, [handleInviteCode, handleFriendToken]);

  // After auth + onboarding complete, check for pending friend token
  useEffect(() => {
    if (!user || !profile?.onboardingCompleted) return;
    AsyncStorage.getItem(PENDING_FRIEND_TOKEN_KEY).then((token) => {
      if (token) {
        AsyncStorage.removeItem(PENDING_FRIEND_TOKEN_KEY);
        setTimeout(() => handleFriendToken(token), 500);
      }
    });
  }, [user?.id, profile?.onboardingCompleted]);

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
