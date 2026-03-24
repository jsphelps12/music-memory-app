import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SectionList,
  Share,
  Alert,
  Modal,
  TextInput,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { MomentCard } from "@/components/MomentCard";
import { MOODS } from "@/constants/Moods";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import {
  fetchPendingRequests,
  fetchTaggedMomentsInbox,
  fetchAcceptedTaggedMoments,
  fetchFriends,
  acceptTaggedMoment,
  hideTaggedMoment,
  getFriendInviteUrl,
  searchByUsername,
  sendFriendRequest,
} from "@/lib/friends";
import type { TaggedMoment, Friendship } from "@/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByMonth(items: TaggedMoment[]): { title: string; data: TaggedMoment[] }[] {
  const groups: Record<string, TaggedMoment[]> = {};
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

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
      } else {
        Alert.alert("Error", friendlyError(e));
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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

// ── TaggedMomentInboxCard ─────────────────────────────────────────────────────

interface InboxCardProps {
  item: TaggedMoment;
  onAccept: (id: string) => void;
  onHide: (id: string) => void;
  allMoods: Array<{ value: string; emoji: string; label: string }>;
}

function InboxCard({ item, onAccept, onHide, allMoods }: InboxCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [acting, setActing] = useState(false);

  const handleAccept = async () => {
    setActing(true);
    try { await acceptTaggedMoment(item.id); onAccept(item.id); } catch {}
    setActing(false);
  };

  const handleHide = async () => {
    setActing(true);
    try { await hideTaggedMoment(item.id); onHide(item.id); } catch {}
    setActing(false);
  };

  return (
    <View style={[styles.inboxCard, { backgroundColor: theme.colors.backgroundSecondary, borderColor: theme.colors.border }]}>
      <View style={styles.inboxCardHeader}>
        <View style={[styles.avatarSmall, { backgroundColor: theme.colors.backgroundTertiary }]}>
          {item.taggerAvatarUrl ? (
            <Image source={{ uri: getPublicPhotoUrl(item.taggerAvatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={[styles.avatarInitial, { color: theme.colors.textTertiary }]}>
              {(item.taggerDisplayName ?? "?")[0]?.toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={[styles.inboxCardFrom, { color: theme.colors.textSecondary }]}>
          <Text style={{ fontWeight: "600", color: theme.colors.text }}>{item.taggerDisplayName ?? "Someone"}</Text> tagged you in a memory
        </Text>
      </View>

      {item.moment && (
        <View style={styles.inboxMomentPreview}>
          {item.moment.songArtworkUrl ? (
            <Image source={{ uri: item.moment.songArtworkUrl }} style={styles.inboxArtwork} contentFit="cover" />
          ) : null}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.inboxSongTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.moment.songTitle}</Text>
            <Text style={[styles.inboxSongArtist, { color: theme.colors.textSecondary }]} numberOfLines={1}>{item.moment.songArtist}</Text>
            {item.moment.reflectionText ? (
              <Text style={[styles.inboxReflection, { color: theme.colors.textSecondary }]} numberOfLines={2}>"{item.moment.reflectionText}"</Text>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.inboxActions}>
        <TouchableOpacity
          style={[styles.inboxActionBtn, styles.inboxHideBtn, { borderColor: theme.colors.border }]}
          onPress={handleHide}
          disabled={acting}
          activeOpacity={0.7}
        >
          <Text style={[styles.inboxHideBtnText, { color: theme.colors.textSecondary }]}>Hide</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.inboxActionBtn, styles.inboxAcceptBtn, { backgroundColor: theme.colors.accent }]}
          onPress={handleAccept}
          disabled={acting}
          activeOpacity={0.8}
        >
          {acting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.inboxAcceptBtnText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const allMoods = useMemo(() => MOODS, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [inbox, setInbox] = useState<TaggedMoment[]>([]);
  const [accepted, setAccepted] = useState<TaggedMoment[]>([]);
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
      const [requests, inboxItems, acceptedItems, friends] = await Promise.all([
        fetchPendingRequests(user.id),
        fetchTaggedMomentsInbox(user.id),
        fetchAcceptedTaggedMoments(user.id),
        fetchFriends(user.id),
      ]);
      setPendingRequests(requests);
      setInbox(inboxItems);
      setAccepted(acceptedItems);
      setHasFriends(friends.length > 0);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) loadData(true);
  }, [user?.id]);

  // Poll every 30s for new tagged moments
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => loadData(true), 30_000);
    return () => clearInterval(interval);
  }, [user?.id, loadData]);

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

  const handleAcceptTag = async (id: string) => {
    setInbox((prev) => prev.filter((i) => i.id !== id));
    await loadData(true);
  };

  const handleHideTag = (id: string) => {
    setInbox((prev) => prev.filter((i) => i.id !== id));
  };

  const handleRemoveAccepted = (id: string) => {
    Alert.alert("Remove memory?", "This will remove it from your With Others. You can't undo this.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setAccepted((prev) => prev.filter((i) => i.id !== id));
          await hideTaggedMoment(id).catch(() => {});
        },
      },
    ]);
  };

  const sections = useMemo(() => {
    const grouped = groupByMonth(accepted);
    return grouped;
  }, [accepted]);

  const hasPendingBanners = pendingRequests.length > 0 || inbox.length > 0;

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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent} />}
        ListHeaderComponent={
          <>
            {/* Pending request banner */}
            {pendingRequests.length > 0 && (
              <TouchableOpacity
                style={[styles.banner, { backgroundColor: theme.colors.accentBg, borderColor: theme.colors.accent }]}
                onPress={() => router.push("/friends-list" as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={18} color={theme.colors.accent} />
                <Text style={[styles.bannerText, { color: theme.colors.accent }]}>
                  {pendingRequests.length === 1
                    ? "1 friend request"
                    : `${pendingRequests.length} friend requests`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            )}

            {/* Inbox (pending tagged moments) */}
            {inbox.length > 0 && (
              <View style={styles.inboxSection}>
                <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary }]}>New</Text>
                {inbox.map((item) => (
                  <InboxCard
                    key={item.id}
                    item={item}
                    onAccept={handleAcceptTag}
                    onHide={handleHideTag}
                    allMoods={allMoods}
                  />
                ))}
              </View>
            )}

            {accepted.length > 0 && (
              <Text style={[styles.sectionLabel, { color: theme.colors.textTertiary, marginTop: hasPendingBanners ? 8 : 0 }]}>
                With Others
              </Text>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.monthHeader, { color: theme.colors.textTertiary }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if (!item.moment) return null;
          return (
            <View style={styles.acceptedCard}>
              <View style={styles.acceptedCardMeta}>
                <View style={[styles.avatarTiny, { backgroundColor: theme.colors.backgroundTertiary }]}>
                  {item.taggerAvatarUrl ? (
                    <Image source={{ uri: getPublicPhotoUrl(item.taggerAvatarUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Text style={[styles.avatarInitialTiny, { color: theme.colors.textTertiary }]}>
                      {(item.taggerDisplayName ?? "?")[0]?.toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={[styles.acceptedCardMetaText, { color: theme.colors.textSecondary }]}>
                  from {item.taggerDisplayName ?? "Someone"}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveAccepted(item.id)} hitSlop={8} style={{ marginLeft: "auto" }}>
                  <Ionicons name="close-circle-outline" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <MomentCard
                item={item.moment}
                onPress={() => router.push(`/moment/${item.moment!.id}` as any)}
                allMoods={allMoods}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          !hasPendingBanners ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={theme.colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>With Others</Text>
              <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
                {hasFriends
                  ? "Tag a friend in a moment and it'll show up here when they accept."
                  : "Add a friend, then tag them in a moment to share it here."}
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
          ) : null
        }
      />

      {/* AddFriendSheet */}
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
    inboxSection: {
      marginTop: 20,
    },
    sectionLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 10,
      marginTop: 20,
    },
    monthHeader: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 24,
      marginBottom: 8,
    },
    inboxCard: {
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 14,
      marginBottom: 12,
    },
    inboxCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    inboxCardFrom: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
    },
    inboxMomentPreview: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    inboxArtwork: {
      width: 52,
      height: 52,
      borderRadius: 6,
    },
    inboxSongTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    inboxSongArtist: {
      fontSize: theme.fontSize.xs,
      marginTop: 2,
    },
    inboxReflection: {
      fontSize: theme.fontSize.xs,
      marginTop: 4,
      fontStyle: "italic",
      lineHeight: 16,
    },
    inboxActions: {
      flexDirection: "row",
      gap: 10,
    },
    inboxActionBtn: {
      flex: 1,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    inboxHideBtn: {
      borderWidth: 1,
    },
    inboxHideBtnText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    inboxAcceptBtn: {},
    inboxAcceptBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
    },
    acceptedCard: {
      marginBottom: 16,
    },
    acceptedCardMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    acceptedCardMetaText: {
      fontSize: theme.fontSize.xs,
    },
    avatarSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarTiny: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarInitial: {
      fontSize: 13,
      fontWeight: theme.fontWeight.semibold,
    },
    avatarInitialTiny: {
      fontSize: 9,
      fontWeight: theme.fontWeight.semibold,
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
