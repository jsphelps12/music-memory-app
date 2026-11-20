import { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { AppImage } from "@/components/AppImage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import {
  fetchProfileByFriendToken,
  fetchFriendshipStatus,
  isConnected,
  acceptFriendInvite,
  ProfileResult,
} from "@/lib/friends";
import { invalidateFriendCaches } from "@/lib/cacheInvalidation";
import { useAuth } from "@/contexts/AuthContext";

import { goHome } from "@/lib/goHome";
type ScreenState =
  | "loading"
  | "not_found"
  | "error"
  | "already_self"
  | "already_friends"
  | "ready"
  | "sending"
  | "sent";

// Opened from a friend link: a task presented full screen, so it closes
// with an ✕ (DESIGN.md, Pushed vs presented). Ink actions, never terracotta.
export default function FriendInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [state, setState] = useState<ScreenState>("loading");
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [error, setError] = useState("");

  const handleClose = () => {
    goHome(router);
  };

  useEffect(() => {
    if (!token || !user) return;
    loadProfile();
  // loadProfile reads token/user, which are the deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  async function loadProfile() {
    setState("loading");
    setError("");
    try {
      // null means no profile has this token; a failed request throws and
      // lands in the catch below as "error", not "not_found".
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

      // Only an accepted row counts. Connecting upgrades a legacy pending or
      // declined row, so those still get the Connect button.
      const status = await fetchFriendshipStatus(user!.id, data.id);

      setProfile(data);
      setState(isConnected(status) ? "already_friends" : "ready");
    } catch (e) {
      setError(friendlyError(e));
      setState("error");
    }
  }

  async function handleConnect() {
    if (!token || !user) return;
    setState("sending");
    setError("");
    try {
      await acceptFriendInvite(token);
      invalidateFriendCaches(queryClient, user.id);
      // The You tab's friend count, which invalidateFriendCaches doesn't cover yet.
      void queryClient.invalidateQueries({ queryKey: ["youSummary", user.id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("sent");
      setTimeout(() => goHome(router), 1500);
    } catch (e: any) {
      if (e.message === "self_request") {
        setState("already_self");
      } else if (e.message === "already_connected") {
        setState("already_friends");
      } else if (e.message === "not_found") {
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

  const avatar = (
    <View style={styles.avatarContainer}>
      {avatarUri ? (
        <AppImage source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={styles.initials}>{initials}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader leading="close" onLeadingPress={handleClose} />

      {state === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      )}

      {state === "error" && <ErrorState message={error} onRetry={loadProfile} onBack={handleClose} />}

      {state === "not_found" && (
        <View style={styles.center}>
          <Icon name="link-outline" size={40} color={theme.colors.textSecondary} />
          <Text style={[styles.title, styles.titleSpaced]}>This link doesn&apos;t work anymore</Text>
          <Text style={styles.sub}>Ask your friend to send you a new one.</Text>
          <Button label="Go back" onPress={handleClose} />
        </View>
      )}

      {state === "already_self" && (
        <View style={styles.center}>
          <Icon name="person-outline" size={40} color={theme.colors.textSecondary} />
          <Text style={[styles.title, styles.titleSpaced]}>That&apos;s your link</Text>
          <Text style={styles.sub}>Share it with friends so they can connect with you.</Text>
          <Button label="Got it" onPress={handleClose} />
        </View>
      )}

      {state === "already_friends" && profile && (
        <View style={styles.center}>
          {avatar}
          <Text style={styles.name}>{displayName}</Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          <Text style={[styles.title, styles.titleSpaced]}>You&apos;re already connected</Text>
          <Text style={styles.sub}>You and {firstName} are already friends on Soundtracks.</Text>
          <Button label="Got it" onPress={handleClose} />
        </View>
      )}

      {(state === "ready" || state === "sending" || state === "sent") && profile && (
        <View style={styles.content}>
          {avatar}

          <Text style={styles.name}>{displayName}</Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}

          <Text style={styles.headline}>{firstName} invited you to connect on Soundtracks</Text>
          <Text style={styles.sub}>
            Share music memories with friends. Once you&apos;re connected, you can send moments straight to each other.
          </Text>

          {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}

          {state === "sent" ? (
            <View style={styles.sentRow} accessibilityLiveRegion="polite">
              <Icon name="checkmark-circle" size={20} color={theme.colors.success} />
              <Text style={styles.sentText}>You&apos;re now friends</Text>
            </View>
          ) : (
            <Button
              label={`Connect with ${firstName}`}
              onPress={handleConnect}
              loading={state === "sending"}
            />
          )}

          <Button
            label="Not now"
            variant="text"
            tone="secondary"
            fullWidth
            onPress={handleClose}
            style={styles.notNow}
          />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
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
      paddingTop: theme.spacing["2xl"],
    },
    avatarContainer: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: theme.spacing.lg,
      backgroundColor: theme.colors.backgroundTertiary,
    },
    initials: {
      ...theme.typography.title,
      fontSize: 36,
      lineHeight: 42,
      color: theme.colors.textSecondary,
    },
    name: {
      ...theme.typography.title,
      color: theme.colors.text,
      textAlign: "center",
    },
    username: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
    headline: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.lg,
      lineHeight: 24,
      color: theme.colors.text,
      textAlign: "center",
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm + 2,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
    titleSpaced: {
      marginTop: theme.spacing.xl,
    },
    sub: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing["3xl"],
    },
    errorText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    sentRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      minHeight: 52,
    },
    sentText: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    notNow: {
      marginTop: theme.spacing.xs,
    },
  });
}
