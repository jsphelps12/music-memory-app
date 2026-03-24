import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { fetchProfileByFriendToken, sendFriendRequest, ProfileResult } from "@/lib/friends";

export default function FriendRequestScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetchProfileByFriendToken(token).then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, [token]);

  const handleClose = () => {
    router.replace("/(tabs)/friends" as any);
  };

  const handleAdd = async () => {
    if (!profile) return;
    setSending(true);
    try {
      await sendFriendRequest(profile.id);
      setSent(true);
    } catch (e: any) {
      if (e.message === "already_connected") {
        Alert.alert("Already connected", `You're already connected with ${profile.displayName ?? "them"}.`);
        setSent(true);
      } else {
        Alert.alert("Error", friendlyError(e));
      }
    } finally {
      setSending(false);
    }
  };

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;
  const initials = (profile?.displayName ?? profile?.username ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={{ width: 32 }} />
        <View style={{ flex: 1 }} />
        <CloseButton onPress={handleClose} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={[styles.notFoundText, { color: theme.colors.textSecondary }]}>
            This friend link is no longer valid.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
            <Text style={[styles.notFoundText, { color: theme.colors.accent }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Avatar */}
          <View style={[styles.avatarContainer, { backgroundColor: theme.colors.backgroundTertiary }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Text style={[styles.initials, { color: theme.colors.textTertiary }]}>{initials}</Text>
            )}
          </View>

          <Text style={[styles.name, { color: theme.colors.text }]}>
            {profile.displayName ?? profile.username ?? "Unknown"}
          </Text>
          {profile.username && (
            <Text style={[styles.username, { color: theme.colors.textSecondary }]}>@{profile.username}</Text>
          )}

          <Text style={[styles.headline, { color: theme.colors.text }]}>
            Add {profile.displayName?.split(" ")[0] ?? "them"} as a Friend on Soundtracks
          </Text>
          <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
            Share music memories with friends. When you tag them in a moment, they'll get a notification.
          </Text>

          {sent ? (
            <View style={[styles.sentBadge, { backgroundColor: theme.colors.accentBg }]}>
              <Text style={[styles.sentText, { color: theme.colors.accent }]}>Friend request sent!</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.colors.accent, opacity: sending ? 0.7 : 1 }]}
              onPress={handleAdd}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.addBtnText}>Add {profile.displayName?.split(" ")[0] ?? "Friend"}</Text>
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
      fontWeight: "700",
    },
    name: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      textAlign: "center",
    },
    username: {
      fontSize: theme.fontSize.base,
      marginTop: 4,
      marginBottom: 24,
    },
    headline: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      textAlign: "center",
      marginBottom: 10,
    },
    sub: {
      fontSize: theme.fontSize.sm,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 32,
    },
    addBtn: {
      width: "100%",
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    addBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    notNowBtn: {
      padding: 12,
    },
    notNowText: {
      fontSize: theme.fontSize.sm,
    },
    sentBadge: {
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: theme.radii.md,
      marginBottom: 12,
      width: "100%",
      alignItems: "center",
    },
    sentText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    notFoundText: {
      fontSize: theme.fontSize.base,
      textAlign: "center",
    },
  });
}
