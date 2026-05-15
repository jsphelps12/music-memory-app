import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Share,
  Alert,
  Modal,
  TextInput,
  Keyboard,
  Platform,
  RefreshControl,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { friendlyError } from "@/lib/errors";
import {
  fetchPendingRequests,
  fetchFriends,
  getFriendInviteUrl,
  searchByUsername,
  sendFriendRequest,
} from "@/lib/friends";
import type { Friendship } from "@/types";

// ── AddFriendSheet ────────────────────────────────────────────────────────────

interface AddFriendSheetProps {
  visible: boolean;
  onClose: () => void;
  friendInviteToken: string;
  currentUserId: string;
  onRequestSent?: () => void;
}

function AddFriendSheet({ visible, onClose, friendInviteToken, currentUserId, onRequestSent }: AddFriendSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSent(new Set());
    }
  }, [visible]);

  const handleQuery = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchByUsername(text, currentUserId);
        setResults(res);
      } catch {}
      setSearching(false);
    }, 400);
  }, [currentUserId]);

  const handleShareLink = async () => {
    try {
      await Share.share({ url: getFriendInviteUrl(friendInviteToken) });
    } catch {}
  };

  const handleAdd = async (userId: string, name: string) => {
    setSending(userId);
    try {
      await sendFriendRequest(userId);
      setSent((prev) => new Set([...prev, userId]));
      onRequestSent?.();
    } catch (e: any) {
      if (e.message === "already_connected") {
        Alert.alert("Already connected", `You're already connected with ${name}.`);
      } else if (e.message === "self_request") {
        Alert.alert("That's you!", "You can't add yourself as a friend.");
      } else {
        Alert.alert("Error", friendlyError(e));
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Add Friend</Text>
          <CloseButton onPress={onClose} />
        </View>

        {/* Share link */}
        <TouchableOpacity style={[styles.shareLinkRow, { backgroundColor: theme.colors.accentBg }]} onPress={handleShareLink} activeOpacity={0.8}>
          <Ionicons name="link-outline" size={20} color={theme.colors.accent} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.shareLinkTitle, { color: theme.colors.text }]}>Share Friend Link</Text>
            <Text style={[styles.shareLinkSub, { color: theme.colors.textSecondary }]}>Anyone with the link can add you as a friend</Text>
          </View>
          <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
        </TouchableOpacity>

        {/* Username search */}
        <Text style={[styles.orDivider, { color: theme.colors.textTertiary }]}>or search by @username</Text>
        <View style={[styles.searchRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}>
          <Ionicons name="at-outline" size={16} color={theme.colors.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="username"
            placeholderTextColor={theme.colors.placeholder}
            value={query}
            onChangeText={handleQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {results.map((result) => {
          const isSent = sent.has(result.id);
          return (
            <View key={result.id} style={[styles.resultRow, { borderBottomColor: theme.colors.border }]}>
              <View style={[styles.avatarSmall, { backgroundColor: theme.colors.backgroundTertiary }]}>
                {result.avatarUrl ? (
                  <Image source={{ uri: getPublicPhotoUrl(result.avatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={[styles.avatarInitial, { color: theme.colors.textTertiary }]}>
                    {(result.displayName ?? result.username ?? "?")[0]?.toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.resultName, { color: theme.colors.text }]}>{result.displayName ?? result.username}</Text>
                {result.username && (
                  <Text style={[styles.resultUsername, { color: theme.colors.textSecondary }]}>@{result.username}</Text>
                )}
              </View>
              {isSent ? (
                <Text style={[styles.sentLabel, { color: theme.colors.textSecondary }]}>Sent</Text>
              ) : (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: theme.colors.accent }]}
                  onPress={() => handleAdd(result.id, result.displayName ?? result.username ?? "them")}
                  disabled={sending === result.id}
                  activeOpacity={0.8}
                >
                  {sending === result.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addButtonText}>Add</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {query.length > 0 && !searching && results.length === 0 && (
          <Text style={[styles.noResults, { color: theme.colors.textSecondary }]}>No users found for "@{query}"</Text>
        )}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );

}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [hasFriends, setHasFriends] = useState(false);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const lastFetchRef = useRef(0);
  const COOLDOWN = 2 * 60 * 1000;

  const loadData = useCallback(async (force = false) => {
    if (!user) return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < COOLDOWN) return;
    lastFetchRef.current = now;
    try {
      const [requests, friends] = await Promise.all([
        fetchPendingRequests(user.id),
        fetchFriends(user.id),
      ]);
      setPendingRequests(requests);
      setHasFriends(friends.length > 0);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) loadData(true);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Friends</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push("/friends-list" as any)}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.headerBtn}
          >
            <Ionicons name="people-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAddFriendVisible(true)}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.headerBtn}
          >
            <Ionicons name="person-add-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent} />}
      >
        {/* Username setup prompt */}
        {!profile?.usernameCustomized && (
          <TouchableOpacity
            style={[styles.banner, { backgroundColor: theme.colors.chipBg, borderColor: theme.colors.border }]}
            onPress={() => router.push("/profile-edit" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="at-outline" size={18} color={theme.colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerText, { color: theme.colors.text }]}>Set your username</Text>
              <Text style={[styles.bannerSubtext, { color: theme.colors.textSecondary }]}>
                Your current username is @{profile?.username} — tap to make it yours
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Pending friend requests */}
        {pendingRequests.length > 0 && (
          <TouchableOpacity
            style={[styles.banner, { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent }]}
            onPress={() => router.push("/friends-list" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={18} color={theme.colors.accent} />
            <Text style={[styles.bannerText, { color: theme.colors.accent }]}>
              {pendingRequests.length === 1 ? "1 friend request" : `${pendingRequests.length} friend requests`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        )}

        {/* Empty state */}
        {pendingRequests.length === 0 && !profile?.usernameCustomized === false && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>With Me</Text>
            <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
              {hasFriends
                ? "Moments friends tag you in will appear here."
                : "Add a friend, then tag each other in moments to share memories."}
            </Text>
            {!hasFriends && (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: theme.colors.accent }]}
                onPress={() => setAddFriendVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Add a Friend</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <AddFriendSheet
        visible={addFriendVisible}
        onClose={() => setAddFriendVisible(false)}
        friendInviteToken={profile?.friendInviteToken ?? ""}
        currentUserId={user?.id ?? ""}
        onRequestSent={() => {}}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 56,
      paddingBottom: 12,
      paddingHorizontal: theme.spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
    },
    headerActions: {
      flexDirection: "row",
      gap: 4,
    },
    headerBtn: {
      padding: 6,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 40,
      flexGrow: 1,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      marginTop: 16,
    },
    bannerText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    bannerSubtext: {
      fontSize: theme.fontSize.xs,
      marginTop: 2,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    emptySub: {
      fontSize: theme.fontSize.base,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: theme.spacing["2xl"],
    },
    emptyBtn: {
      paddingHorizontal: 28,
      paddingVertical: 13,
      borderRadius: theme.radii.button,
    },
    emptyBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    // Modal / sheet
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "75%",
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
      opacity: 0.4,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: "600",
    },
    shareLinkRow: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radii.md,
      padding: 14,
      marginBottom: 20,
    },
    shareLinkTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    shareLinkSub: {
      fontSize: theme.fontSize.xs,
      marginTop: 2,
    },
    orDivider: {
      fontSize: theme.fontSize.xs,
      textAlign: "center",
      marginBottom: 12,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      height: 44,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultName: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
    },
    resultUsername: {
      fontSize: theme.fontSize.sm,
      marginTop: 2,
    },
    addButton: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 20,
      minWidth: 60,
      alignItems: "center",
    },
    addButtonText: {
      color: "#fff",
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    sentLabel: {
      fontSize: theme.fontSize.sm,
    },
    noResults: {
      textAlign: "center",
      fontSize: theme.fontSize.sm,
      marginTop: 12,
    },
  });
}
