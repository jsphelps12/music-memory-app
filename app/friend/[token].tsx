import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import {
  fetchProfileByFriendToken,
  acceptFriendInvite,
  ProfileResult,
} from "@/lib/friends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type ScreenState =
  | "loading"
  | "not_found"
  | "already_self"
  | "already_friends"
  | "ready"
  | "sending"
  | "sent";

export default function FriendInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [state, setState] = useState<ScreenState>("loading");
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [error, setError] = useState("");

  const handleClose = () => {
    router.replace("/(tabs)" as any);
  };

  useEffect(() => {
    if (!token || !user) return;
    loadProfile();
  }, [token, user]);

  async function loadProfile() {
    setState("loading");
    setError("");
    try {
      const data = await fetchProfileByFriendToken(token!);
      if (!data) {
        setState("not_found");
        return;
      }

      // Can't add yourself
      if (data.id === user!.id) {
        setState("already_self");
        setProfile(data);
        return;
      }

      // Check for existing friendship (any status)
      const { data: existing } = await supabase
        .from("friendships")
        .select("id, status")
        .or(
          `and(requester_id.eq.${user!.id},addressee_id.eq.${data.id}),and(requester_id.eq.${data.id},addressee_id.eq.${user!.id})`
        )
        .maybeSingle();

      setProfile(data);
      if (existing) {
        setState("already_friends");
      } else {
        setState("ready");
      }
    } catch {
      setState("not_found");
    }
  }

  async function handleConnect() {
    if (!token || !user) return;
    setState("sending");
    setError("");
    try {
      await acceptFriendInvite(token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("sent");
      setTimeout(() => router.replace("/(tabs)" as any), 1500);
    } catch (e: any) {
      if (e.message === "self_request") {
        setState("already_self");
      } else if (e.message === "already_connected") {
        setState("already_friends");
      } else if (e.message === "not_found") {
        Alert.alert("Invalid link", "This friend link is no longer valid.");
        setState("not_found");
      } else {
        setError(friendlyError(e));
        setState("ready");
      }
    }
  }

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;
  const firstName = profile?.displayName?.split(" ")[0] ?? "Someone";
  const displayName = profile?.displayName ?? profile?.username ?? "Unknown";
  const initials = displayName[0]?.toUpperCase() ?? "?";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <CloseButton onPress={handleClose} />
      </View>

      {state === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} size="large" />
        </View>
      )}

      {state === "not_found" && (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            Link not found
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            This friend link may no longer be valid.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "already_self" && (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            That's your link!
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            Share it with friends so they can connect with you.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "already_friends" && profile && (
        <View style={styles.center}>
          <View style={[styles.avatarContainer, { backgroundColor: theme.colors.backgroundTertiary }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={[styles.initials, { color: theme.colors.textTertiary }]}>{initials}</Text>
            )}
          </View>
          <Ionicons
            name="checkmark-circle"
            size={28}
            color={theme.colors.accent}
            style={{ marginTop: -14, marginBottom: 12 }}
          />
          <Text style={[styles.name, { color: theme.colors.text }]}>{displayName}</Text>
          {profile.username && (
            <Text style={[styles.username, { color: theme.colors.textSecondary }]}>
              @{profile.username}
            </Text>
          )}
          <Text style={[styles.title, { color: theme.colors.text, marginTop: 20 }]}>
            You're already connected
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            You and {firstName} are already friends on Soundtracks.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.colors.accent }]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      {(state === "ready" || state === "sending" || state === "sent") && profile && (
        <View style={styles.content}>
          <View style={[styles.avatarContainer, { backgroundColor: theme.colors.backgroundTertiary }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={[styles.initials, { color: theme.colors.textTertiary }]}>{initials}</Text>
            )}
          </View>

          <Text style={[styles.name, { color: theme.colors.text }]}>{displayName}</Text>
          {profile.username && (
            <Text style={[styles.username, { color: theme.colors.textSecondary }]}>
              @{profile.username}
            </Text>
          )}

          <Text style={[styles.headline, { color: theme.colors.text }]}>
            {firstName} invited you to connect on Soundtracks
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            Share music memories with friends. When you tag them in a moment, they'll get a notification.
          </Text>

          {error ? (
            <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{error}</Text>
          ) : null}

          {state === "sent" ? (
            <View style={[styles.sentBadge, { backgroundColor: theme.colors.accentBg }]}>
              <Text style={[styles.sentText, { color: theme.colors.accent }]}>
                You're now friends! 🎉
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.colors.accent },
                state === "sending" && styles.btnDisabled,
              ]}
              onPress={handleConnect}
              disabled={state === "sending"}
              activeOpacity={0.85}
            >
              {state === "sending" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Connect with {firstName}</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleClose} style={styles.notNowBtn} activeOpacity={0.7}>
            <Text style={[styles.notNowText, { color: theme.colors.textSecondary }]}>Not Now</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingTop: 60,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 8,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
    },
    content: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 24,
    },
    avatarContainer: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: 16,
    },
    initials: {
      fontSize: 36,
      fontFamily: theme.fonts.bodyBold,
    },
    name: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
      textAlign: "center",
    },
    username: {
      fontSize: theme.fontSize.base,
      marginTop: 4,
      marginBottom: 24,
    },
    headline: {
      fontSize: theme.fontSize.lg,
      fontFamily: theme.fonts.bodySemibold,
      textAlign: "center",
      marginBottom: 10,
    },
    title: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.bodySemibold,
      textAlign: "center",
      marginBottom: 8,
    },
    sub: {
      fontSize: theme.fontSize.sm,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 32,
    },
    errorText: {
      fontSize: theme.fontSize.sm,
      textAlign: "center",
      marginBottom: 12,
    },
    primaryBtn: {
      width: "100%",
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    sentBadge: {
      width: "100%",
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: theme.radii.md,
      alignItems: "center",
      marginBottom: 12,
    },
    sentText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    notNowBtn: {
      padding: 12,
    },
    notNowText: {
      fontSize: theme.fontSize.sm,
    },
  });
}
