import { useCallback, useEffect, useRef } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { handleAuthDeepLink } from "@/lib/auth-linking";
import { wasShareTokenOpened } from "@/lib/sharedMomentLink";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";
export const PENDING_FRIEND_TOKEN_KEY = "pending_friend_token";
/** A /m/{token} share link that arrived before the app could open it. */
export const PENDING_SHARE_TOKEN_KEY = "pending_share_token";
/** Pre-v2 installs may still carry one; it is only ever cleared. */
const LEGACY_PENDING_GIFT_TOKEN_KEY = "pending_gift_token";

// Prefixes written to clipboard on web for deferred deep link (cold install) fallback.
const CLIPBOARD_INVITE_PREFIX = "soundtracks-invite:";
const CLIPBOARD_FRIEND_PREFIX = "soundtracks-friend:";
const CLIPBOARD_GIFT_PREFIX = "soundtracks-gift:";

const HAS_LAUNCHED_KEY = "has_launched";

type DeferredLink = { kind: "invite" | "friend" | "gift"; value: string };

/**
 * Read the clipboard once and match all deferred-link prefixes.
 * Reading the clipboard triggers the iOS paste-permission prompt, so this only
 * runs on the very first launch after install (the only case the web fallback
 * targets) — has_launched is written after first-launch routing in _layout,
 * i.e. after this check has already run.
 */
async function checkClipboardForDeferredLink(): Promise<DeferredLink | null> {
  try {
    if ((await AsyncStorage.getItem(HAS_LAUNCHED_KEY)) === "true") return null;
    const text = await Clipboard.getStringAsync();
    const kinds = [
      { kind: "invite", prefix: CLIPBOARD_INVITE_PREFIX },
      { kind: "friend", prefix: CLIPBOARD_FRIEND_PREFIX },
      { kind: "gift", prefix: CLIPBOARD_GIFT_PREFIX },
    ] as const;
    for (const { kind, prefix } of kinds) {
      if (text.startsWith(prefix)) {
        const value = text.replace(prefix, "").trim();
        await Clipboard.setStringAsync("");
        return value ? { kind, value } : null;
      }
    }
  } catch {}
  return null;
}

export function useDeepLinkHandler() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // Deduplicate URL handling — getInitialURL + addEventListener both fire for same URL
  const lastHandledUrlRef = useRef<string | null>(null);
  // Deduplicate friend-accept navigations by token value — URL + AsyncStorage + clipboard can all fire the same token
  const handledFriendTokensRef = useRef(new Set<string>());

  const handleInviteCode = useCallback(async (inviteCode: string) => {
    if (user) {
      router.push({ pathname: "/join" as any, params: { inviteCode } });
    } else {
      await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, inviteCode);
    }
  }, [user, router]);

  const handleFriendToken = useCallback(async (token: string) => {
    if (user) {
      if (handledFriendTokensRef.current.has(token)) return;
      handledFriendTokensRef.current.add(token);
      router.push({ pathname: "/friend/[token]" as any, params: { token } });
    } else {
      await AsyncStorage.setItem(PENDING_FRIEND_TOKEN_KEY, token);
    }
  }, [user, router]);

  const handleUrl = useCallback(async (url: string) => {
    if (lastHandledUrlRef.current === url) return;
    lastHandledUrlRef.current = url;

    // Universal Links — https://soundtracks.app/m/{share_token}
    // Expo Router opens app/m/[token].tsx itself. The token is parked whenever
    // the app might not be able to show it yet: signed out, or a cold start
    // where auth hasn't restored (user is null here even for a signed-in
    // user). The pending-token effect below opens it once the user is in,
    // skipping it if the route already did.
    const universalMomentMatch = url.match(/^https:\/\/soundtracks\.app\/m\/([a-zA-Z0-9-]+)/);
    if (universalMomentMatch) {
      if (!user || !profile?.onboardingCompleted) {
        await AsyncStorage.setItem(PENDING_SHARE_TOKEN_KEY, universalMomentMatch[1]);
      }
      return;
    }

    // Universal Links — https://soundtracks.app/friend/{token}
    // Navigation is handled natively by the app/friend/[token].tsx Expo Router route.
    // We only need to stash the token in AsyncStorage when the user is not yet signed in
    // so the pending-token effect can redirect them after auth completes.
    const universalFriendMatch = url.match(/^https:\/\/soundtracks\.app\/friend\/([a-zA-Z0-9-]+)/);
    if (universalFriendMatch) {
      if (!user) {
        await AsyncStorage.setItem(PENDING_FRIEND_TOKEN_KEY, universalFriendMatch[1]);
      }
      return;
    }

    // Universal Links — https://soundtracks.app/c/{inviteCode}
    const universalAlbumMatch = url.match(/^https:\/\/soundtracks\.app\/c\/([a-zA-Z0-9]+)/);
    if (universalAlbumMatch) {
      await handleInviteCode(universalAlbumMatch[1]);
      return;
    }

    // Custom scheme — soundtracks://join?inviteCode={code}
    const joinMatch = url.match(/^soundtracks:\/\/join\?inviteCode=([a-zA-Z0-9]+)/);
    if (joinMatch) {
      await handleInviteCode(joinMatch[1]);
      return;
    }

    // Custom scheme — soundtracks://friend?token={token}
    const friendMatch = url.match(/^soundtracks:\/\/friend\?token=([a-zA-Z0-9-]+)/);
    if (friendMatch) {
      await handleFriendToken(friendMatch[1]);
      return;
    }

    // Auth deep link (PKCE). Only handle codes that arrive on the bare scheme —
    // the /confirm route owns https://soundtracks.app/confirm and calls
    // exchangeCodeForSession itself. Handling it here too raced that call on a
    // single-use code, so ~half of email confirmations showed a false "link
    // expired" error. An allowlist also keeps unrelated callbacks (e.g.
    // spotify-callback?code=) from being POSTed to Supabase's token endpoint.
    const isAuthCallback =
      /^soundtracks(-beta)?:\/\/(\?|$)/.test(url) ||
      /^soundtracks(-beta)?:\/\/confirm\b/.test(url);
    if (isAuthCallback) {
      handleAuthDeepLink(url).catch(() => {});
    }
  }, [handleInviteCode, handleFriendToken, user, profile?.onboardingCompleted]);

  // Clipboard check — deferred deep link fallback for cold installs via web invite/friend/gift pages
  useEffect(() => {
    // The handlers are async and write to AsyncStorage, so returning their
    // promise keeps them inside this chain — otherwise a failed write becomes
    // an unhandled rejection at startup.
    checkClipboardForDeferredLink()
      .then((link) => {
        if (!link) return;
        if (link.kind === "invite") return handleInviteCode(link.value);
        if (link.kind === "friend") return handleFriendToken(link.value);
        return AsyncStorage.setItem(PENDING_SHARE_TOKEN_KEY, link.value);
      })
      .catch((err) => { if (__DEV__) console.warn("[deep-link] clipboard fallback failed:", err); });
  }, [handleInviteCode, handleFriendToken]);

  // After auth + onboarding complete, check for pending friend token
  useEffect(() => {
    if (!user || !profile?.onboardingCompleted) return;
    AsyncStorage.getItem(PENDING_FRIEND_TOKEN_KEY)
      .then((token) => {
        if (!token) return;
        AsyncStorage.removeItem(PENDING_FRIEND_TOKEN_KEY)
          .catch((err) => { if (__DEV__) console.warn("[deep-link] failed to clear pending friend token:", err); });
        setTimeout(() => {
          handleFriendToken(token)
            .catch((err) => { if (__DEV__) console.warn("[deep-link] friend token routing failed:", err); });
        }, 500);
      })
      .catch((err) => { if (__DEV__) console.warn("[deep-link] pending friend token read failed:", err); });
  }, [user?.id, profile?.onboardingCompleted]);

  // After auth + onboarding complete, open a parked share link. Opening one
  // records nothing, so a token that turns out dead or already opened costs
  // nothing. Also clear the pre-v2 pending-gift key (never read).
  useEffect(() => {
    if (!user || !profile?.onboardingCompleted) return;
    AsyncStorage.removeItem(LEGACY_PENDING_GIFT_TOKEN_KEY).catch(() => {});
    AsyncStorage.getItem(PENDING_SHARE_TOKEN_KEY)
      .then((token) => {
        if (!token) return;
        AsyncStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
          .catch((err) => { if (__DEV__) console.warn("[deep-link] failed to clear pending share token:", err); });
        // The delay lets a cold-start route to /m/{token} mount first, so the
        // same link isn't opened twice.
        setTimeout(() => {
          if (wasShareTokenOpened(token)) return;
          router.push({ pathname: "/m/[token]" as any, params: { token } });
        }, 500);
      })
      .catch((err) => { if (__DEV__) console.warn("[deep-link] pending share token read failed:", err); });
  }, [user?.id, profile?.onboardingCompleted]);

  // URI scheme deep links — app already installed
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => (url ? handleUrl(url) : undefined))
      .catch((err) => { if (__DEV__) console.warn("[deep-link] initial URL handling failed:", err); });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url)
        .catch((err) => { if (__DEV__) console.warn("[deep-link] URL handling failed:", err); });
    });

    return () => subscription.remove();
  }, [handleUrl]);
}
