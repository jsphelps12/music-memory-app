import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import {
  fetchFriends,
  fetchPendingRequests,
  fetchSentRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  cancelFriendRequest,
} from "@/lib/friends";
import type { Friendship } from "@/types";

const AVATAR_SIZE = 40;

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string | null }) {
  const theme = useTheme();
  const initials = (displayName ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <View style={[styles.avatar, { backgroundColor: theme.colors.backgroundTertiary }]}>
      {avatarUrl ? (
        <Image source={{ uri: getPublicPhotoUrl(avatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[styles.avatarInitial, { color: theme.colors.textTertiary }]}>{initials}</Text>
      )}
    </View>
  );
}

export default function FriendsListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pending, setPending] = useState<Friendship[]>([]);
  const [sent, setSent] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sentCollapsed, setSentCollapsed] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [f, p, s] = await Promise.all([
        fetchFriends(user.id),
        fetchPendingRequests(user.id),
        fetchSentRequests(user.id),
      ]);
      setFriends(f);
      setPending(p);
      setSent(s);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAccept = async (friendship: Friendship) => {
    setActing(friendship.id);
    try {
      await acceptFriendRequest(friendship.id);
      setPending((prev) => prev.filter((f) => f.id !== friendship.id));
      setFriends((prev) => [
        ...prev,
        { ...friendship, status: "accepted" },
      ]);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
    setActing(null);
  };

  const handleDecline = async (friendship: Friendship) => {
    setActing(friendship.id);
    try {
      await declineFriendRequest(friendship.id);
      setPending((prev) => prev.filter((f) => f.id !== friendship.id));
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
    setActing(null);
  };

  const handleRemoveFriend = (friendship: Friendship) => {
    const name = friendship.otherUserDisplayName ?? "this person";
    Alert.alert(
      "Remove Friend",
      `Remove ${name} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeFriend(friendship.id);
              setFriends((prev) => prev.filter((f) => f.id !== friendship.id));
            } catch (e) {
              Alert.alert("Error", friendlyError(e));
            }
          },
        },
      ]
    );
  };

  const handleCancelRequest = async (friendship: Friendship) => {
    setActing(friendship.id);
    try {
      await cancelFriendRequest(friendship.id);
      setSent((prev) => prev.filter((f) => f.id !== friendship.id));
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
    setActing(null);
  };

  return (
    <View style={[s.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[s.headerTitle, { color: theme.colors.text }]}>Manage Friends</Text>
        <CloseButton onPress={() => router.back()} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await loadData(); setRefreshing(false); }}
              tintColor={theme.colors.accent}
            />
          }
        >

          {/* Incoming Requests */}
          {pending.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: theme.colors.textTertiary }]}>
                Friend Requests
              </Text>
              {pending.map((friendship) => (
                <View key={friendship.id} style={[s.row, { borderBottomColor: theme.colors.border }]}>
                  <Avatar avatarUrl={friendship.otherUserAvatarUrl} displayName={friendship.otherUserDisplayName} />
                  <View style={s.rowInfo}>
                    <Text style={[s.rowName, { color: theme.colors.text }]}>{friendship.otherUserDisplayName ?? "Unknown"}</Text>
                    {friendship.otherUserUsername && (
                      <Text style={[s.rowUsername, { color: theme.colors.textSecondary }]}>@{friendship.otherUserUsername}</Text>
                    )}
                  </View>
                  <View style={s.requestActions}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.declineBtn, { borderColor: theme.colors.border }]}
                      onPress={() => handleDecline(friendship)}
                      disabled={acting === friendship.id}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.declineBtnText, { color: theme.colors.textSecondary }]}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.acceptBtn, { backgroundColor: theme.colors.accent }]}
                      onPress={() => handleAccept(friendship)}
                      disabled={acting === friendship.id}
                      activeOpacity={0.8}
                    >
                      {acting === friendship.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={s.acceptBtnText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* My Friends */}
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: theme.colors.textTertiary }]}>
              My Friends ({friends.length})
            </Text>
            {friends.length === 0 ? (
              <Text style={[s.emptyText, { color: theme.colors.textSecondary }]}>
                Share your friend link to connect with others.
              </Text>
            ) : (
              friends.map((friendship) => (
                <TouchableOpacity
                  key={friendship.id}
                  style={[s.row, { borderBottomColor: theme.colors.border }]}
                  onLongPress={() => handleRemoveFriend(friendship)}
                  activeOpacity={0.85}
                  delayLongPress={400}
                >
                  <Avatar avatarUrl={friendship.otherUserAvatarUrl} displayName={friendship.otherUserDisplayName} />
                  <View style={s.rowInfo}>
                    <Text style={[s.rowName, { color: theme.colors.text }]}>{friendship.otherUserDisplayName ?? "Unknown"}</Text>
                    {friendship.otherUserUsername && (
                      <Text style={[s.rowUsername, { color: theme.colors.textSecondary }]}>@{friendship.otherUserUsername}</Text>
                    )}
                  </View>
                  <Text style={[s.longPressHint, { color: theme.colors.textTertiary }]}>hold to remove</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Sent Requests */}
          {sent.length > 0 && (
            <View style={s.section}>
              <TouchableOpacity
                style={s.sectionToggle}
                onPress={() => setSentCollapsed((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[s.sectionLabel, { color: theme.colors.textTertiary }]}>
                  Sent Requests ({sent.length})
                </Text>
                <Ionicons
                  name={sentCollapsed ? "chevron-down" : "chevron-up"}
                  size={14}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
              {!sentCollapsed && sent.map((friendship) => (
                <View key={friendship.id} style={[s.row, { borderBottomColor: theme.colors.border }]}>
                  <Avatar avatarUrl={friendship.otherUserAvatarUrl} displayName={friendship.otherUserDisplayName} />
                  <View style={s.rowInfo}>
                    <Text style={[s.rowName, { color: theme.colors.text }]}>{friendship.otherUserDisplayName ?? "Unknown"}</Text>
                    {friendship.otherUserUsername && (
                      <Text style={[s.rowUsername, { color: theme.colors.textSecondary }]}>@{friendship.otherUserUsername}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[s.actionBtn, s.cancelBtn, { borderColor: theme.colors.border }]}
                    onPress={() => handleCancelRequest(friendship)}
                    disabled={acting === friendship.id}
                    activeOpacity={0.7}
                  >
                    {acting === friendship.id ? (
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : (
                      <Text style={[s.cancelBtnText, { color: theme.colors.textSecondary }]}>Cancel</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "600",
  },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: 12,
      paddingHorizontal: theme.spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 40,
    },
    section: {
      marginTop: 28,
    },
    sectionLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    sectionToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 12,
    },
    rowInfo: {
      flex: 1,
    },
    rowName: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
    },
    rowUsername: {
      fontSize: theme.fontSize.sm,
      marginTop: 1,
    },
    longPressHint: {
      fontSize: theme.fontSize.xs,
    },
    requestActions: {
      flexDirection: "row",
      gap: 8,
    },
    actionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 70,
    },
    declineBtn: {
      borderWidth: 1,
    },
    declineBtnText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    acceptBtn: {},
    acceptBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    cancelBtn: {
      borderWidth: 1,
    },
    cancelBtnText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    emptyText: {
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
    },
  });
}
