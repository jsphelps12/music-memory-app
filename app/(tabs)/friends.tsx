import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Platform,
  RefreshControl,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { friendlyError } from "@/lib/errors";
import { getPublicPhotoUrl } from "@/lib/storage";
import {
  fetchPendingRequests,
  fetchFriends,
  getFriendInviteUrl,
  searchByUsername,
  sendFriendRequest,
  fetchTaggedMomentsSharedTab,
} from "@/lib/friends";
import {
  fetchSharedCollectionActivity,
  markCollectionViewed,
  fetchPendingCollectionInvites,
  acceptCollectionInvite,
  deleteCollectionInvite,
  SharedCollectionActivity,
  CollectionInvite,
} from "@/lib/collections";
import type { Friendship, TaggedMoment } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
    if (!visible) { setQuery(""); setResults([]); setSent(new Set()); }
  }, [visible]);

  const handleQuery = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchByUsername(text, currentUserId)); } catch {}
      setSearching(false);
    }, 400);
  }, [currentUserId]);

  const handleShareLink = async () => {
    try { await Share.share({ url: getFriendInviteUrl(friendInviteToken) }); } catch {}
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
    } finally { setSending(null); }
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
          <TouchableOpacity style={[styles.shareLinkRow, { backgroundColor: theme.colors.accentBg }]} onPress={handleShareLink} activeOpacity={0.8}>
            <Ionicons name="link-outline" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.shareLinkTitle, { color: theme.colors.text }]}>Share Friend Link</Text>
              <Text style={[styles.shareLinkSub, { color: theme.colors.textSecondary }]}>Anyone with the link can add you as a friend</Text>
            </View>
            <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
          </TouchableOpacity>
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

// ── Tagged Moment Row ─────────────────────────────────────────────────────────

function TaggedRow({ tag, onPress, styles, theme }: { tag: TaggedMoment; onPress: () => void; styles: any; theme: any }) {
  const artwork = tag.moment?.songArtworkUrl;
  return (
    <TouchableOpacity style={styles.taggedRow} onPress={onPress} activeOpacity={0.7}>
      {artwork ? (
        <Image source={{ uri: artwork }} style={styles.taggedArtwork} contentFit="cover" />
      ) : (
        <ArtworkPlaceholder style={styles.taggedArtwork} />
      )}
      <View style={styles.taggedInfo}>
        <Text style={[styles.taggedSong, { color: theme.colors.text }]} numberOfLines={1}>
          {tag.moment?.songTitle ?? "Unknown song"}
        </Text>
        <Text style={[styles.taggedArtist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {tag.moment?.songArtist ?? ""}
        </Text>
        <Text style={[styles.taggedBy, { color: theme.colors.textTertiary }]} numberOfLines={1}>
          {tag.taggerDisplayName ?? "Someone"} tagged you
        </Text>
      </View>
      <Text style={[styles.taggedDate, { color: theme.colors.textTertiary }]}>
        {timeAgo(tag.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

// ── Shared Collection Row ─────────────────────────────────────────────────────

function CollectionRow({ item, onPress, styles, theme }: { item: SharedCollectionActivity; onPress: () => void; styles: any; theme: any }) {
  const isShared = item.role === 'member';
  return (
    <TouchableOpacity style={styles.collectionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.collectionIcon, { backgroundColor: isShared ? theme.colors.accentSecondaryBg : theme.colors.chipBg }]}>
        <Ionicons
          name={isShared ? "people-outline" : "folder-outline"}
          size={18}
          color={isShared ? theme.colors.accentSecondary : theme.colors.textSecondary}
        />
      </View>
      <View style={styles.collectionInfo}>
        <Text style={[styles.collectionName, { color: theme.colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.collectionSub, { color: theme.colors.textSecondary }]}>
          {item.ownerName ? `by ${item.ownerName} · ` : ""}{item.totalMoments} {item.totalMoments === 1 ? "moment" : "moments"}
        </Text>
      </View>
      {item.newMomentCount > 0 && (
        <View style={[styles.newBadge, { backgroundColor: theme.colors.accent }]}>
          <Text style={styles.newBadgeText}>{item.newMomentCount} new</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

// ── Data fetching ─────────────────────────────────────────────────────────────

const STALE_TIME = 2 * 60 * 1000;

async function fetchSharedScreenData(userId: string) {
  const [requests, friends, tagged, collections, invites] = await Promise.all([
    fetchPendingRequests(userId),
    fetchFriends(userId),
    fetchTaggedMomentsSharedTab(userId),
    fetchSharedCollectionActivity(userId),
    fetchPendingCollectionInvites(userId).catch(() => [] as CollectionInvite[]),
  ]);
  return {
    pendingRequests: requests,
    hasFriends: friends.length > 0,
    taggedMoments: tagged,
    sharedCollections: collections,
    collectionInvites: invites,
  };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SharedScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["sharedScreen", user?.id],
    queryFn: () => fetchSharedScreenData(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  const pendingRequests = data?.pendingRequests ?? [];
  const taggedMoments = data?.taggedMoments ?? [];
  const sharedCollections = data?.sharedCollections ?? [];
  const collectionInvites = data?.collectionInvites ?? [];
  const hasFriends = data?.hasFriends ?? false;

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleTapCollection = useCallback((item: SharedCollectionActivity) => {
    markCollectionViewed(item.collectionId, user!.id, item.role).catch(() => {});
    queryClient.setQueryData(["sharedScreen", user?.id], (old: any) =>
      old ? { ...old, sharedCollections: old.sharedCollections.map((c: SharedCollectionActivity) =>
        c.collectionId === item.collectionId ? { ...c, newMomentCount: 0 } : c
      )} : old
    );
    router.push({ pathname: "/collection/[id]" as any, params: { id: item.collectionId } });
  }, [user, router, queryClient]);

  const handleTapTag = useCallback((tag: TaggedMoment) => {
    router.push({
      pathname: "/moment/[id]" as any,
      params: { id: tag.momentId, contributorName: tag.taggerDisplayName ?? undefined },
    });
  }, [router]);

  const handleAcceptInvite = useCallback(async (invite: CollectionInvite) => {
    if (!user) return;
    setRespondingInviteId(invite.id);
    try {
      await acceptCollectionInvite(invite.id, invite.collectionId, user.id);
      // Remove invite optimistically — don't re-fetch invites (replication lag causes it to reappear)
      // Fetch updated collections separately and write both changes into cache at once
      const updatedCollections = await fetchSharedCollectionActivity(user.id);
      queryClient.setQueryData(["sharedScreen", user.id], (old: any) =>
        old ? {
          ...old,
          collectionInvites: old.collectionInvites.filter((i: CollectionInvite) => i.id !== invite.id),
          sharedCollections: updatedCollections,
        } : old
      );
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setRespondingInviteId(null);
    }
  }, [user, queryClient]);

  const handleDeclineInvite = useCallback(async (inviteId: string) => {
    setRespondingInviteId(inviteId);
    try {
      await deleteCollectionInvite(inviteId);
      queryClient.setQueryData(["sharedScreen", user?.id], (old: any) =>
        old ? { ...old, collectionInvites: old.collectionInvites.filter((i: CollectionInvite) => i.id !== inviteId) } : old
      );
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setRespondingInviteId(null);
    }
  }, [user, queryClient]);

  const isEmpty = taggedMoments.length === 0 && sharedCollections.length === 0 && collectionInvites.length === 0;

  if (isLoading) {
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
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Shared</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push("/friends-list" as any)} hitSlop={8} activeOpacity={0.7} style={styles.headerBtn}>
            <Ionicons name="people-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAddFriendVisible(true)} hitSlop={8} activeOpacity={0.7} style={styles.headerBtn}>
            <Ionicons name="person-add-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.listContent, isEmpty && styles.listContentEmpty]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={handleRefresh} tintColor={theme.colors.accent} />}
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

        {/* Collection invites */}
        {collectionInvites.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Collection Invites</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.cardBg }]}>
              {collectionInvites.map((invite, i) => (
                <View key={invite.id}>
                  <View style={styles.inviteRow}>
                    <View style={[styles.collectionIcon, { backgroundColor: theme.colors.accentSecondaryBg }]}>
                      <Ionicons name="people-outline" size={18} color={theme.colors.accentSecondary} />
                    </View>
                    <View style={styles.inviteInfo}>
                      <Text style={[styles.collectionName, { color: theme.colors.text }]} numberOfLines={1}>
                        {invite.collectionName}
                      </Text>
                      <Text style={[styles.collectionSub, { color: theme.colors.textSecondary }]}>
                        {invite.inviterName ? `Invited by ${invite.inviterName}` : "You've been invited"}
                      </Text>
                    </View>
                    <View style={styles.inviteActions}>
                      <TouchableOpacity
                        style={[styles.inviteBtn, styles.inviteBtnDecline, { borderColor: theme.colors.border }]}
                        onPress={() => handleDeclineInvite(invite.id)}
                        disabled={respondingInviteId === invite.id}
                        activeOpacity={0.8}
                      >
                        {respondingInviteId === invite.id ? (
                          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        ) : (
                          <Text style={[styles.inviteBtnText, { color: theme.colors.textSecondary }]}>Decline</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.inviteBtn, styles.inviteBtnAccept, { backgroundColor: theme.colors.accentSecondary }]}
                        onPress={() => handleAcceptInvite(invite)}
                        disabled={respondingInviteId === invite.id}
                        activeOpacity={0.8}
                      >
                        {respondingInviteId === invite.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={[styles.inviteBtnText, { color: "#fff" }]}>Accept</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                  {i < collectionInvites.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <Ionicons name="share-social-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Nothing shared yet</Text>
            <Text style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
              {hasFriends
                ? "When friends tag you in a memory or add to a shared collection, it'll appear here."
                : "Add a friend and tag each other in memories to get started."}
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

        {/* Tagged in */}
        {taggedMoments.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Tagged in</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.cardBg }]}>
              {taggedMoments.map((tag, i) => (
                <View key={tag.id}>
                  <TaggedRow tag={tag} onPress={() => handleTapTag(tag)} styles={styles} theme={theme} />
                  {i < taggedMoments.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Shared Collections */}
        {sharedCollections.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Shared Collections</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.cardBg }]}>
              {sharedCollections.map((item, i) => (
                <View key={item.collectionId}>
                  <CollectionRow item={item} onPress={() => handleTapCollection(item)} styles={styles} theme={theme} />
                  {i < sharedCollections.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
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
      fontFamily: theme.fonts.display,
    },
    headerActions: { flexDirection: "row", gap: 4 },
    headerBtn: { padding: 6 },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      paddingBottom: 40,
    },
    listContentEmpty: { flexGrow: 1 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      marginBottom: 12,
    },
    bannerText: { fontSize: theme.fontSize.sm, fontFamily: theme.fonts.bodySemibold },
    bannerSubtext: { fontSize: theme.fontSize.xs, marginTop: 2 },
    sectionLabel: {
      fontSize: 11,
      fontFamily: theme.fonts.bodySemibold,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 16,
    },
    card: {
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
      marginBottom: 4,
    },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
    // Tagged row
    taggedRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    taggedArtwork: {
      width: 46,
      height: 46,
      borderRadius: 6,
    },
    taggedInfo: { flex: 1, marginLeft: 12 },
    taggedSong: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    taggedArtist: { fontSize: theme.fontSize.sm, marginTop: 1 },
    taggedBy: { fontSize: theme.fontSize.xs, marginTop: 3 },
    taggedDate: { fontSize: theme.fontSize.xs, marginLeft: 8 },
    // Collection row
    collectionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    collectionIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    collectionInfo: { flex: 1, marginLeft: 12 },
    collectionName: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodyMedium },
    collectionSub: { fontSize: theme.fontSize.xs, marginTop: 2 },
    newBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    newBadgeText: { color: "#fff", fontSize: 11, fontFamily: theme.fonts.bodyBold },
    // Invite row
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    inviteInfo: { flex: 1, marginLeft: 12 },
    inviteActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
    inviteBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      minWidth: 70,
      alignItems: "center",
    },
    inviteBtnDecline: { borderWidth: 1 },
    inviteBtnAccept: {},
    inviteBtnText: { fontSize: theme.fontSize.sm, fontFamily: theme.fonts.bodySemibold },
    // Empty state
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      paddingHorizontal: theme.spacing["2xl"],
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontFamily: theme.fonts.display,
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    emptySub: {
      fontSize: theme.fontSize.base,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: theme.spacing["2xl"],
    },
    emptyBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: theme.radii.button },
    emptyBtnText: { color: "#fff", fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    // Modal / sheet
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "75%",
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2,
      alignSelf: "center", marginTop: 12, marginBottom: 4, opacity: 0.4,
    },
    sheetHeader: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", paddingVertical: 12,
    },
    sheetTitle: { fontSize: 17, fontFamily: theme.fonts.bodySemibold },
    shareLinkRow: {
      flexDirection: "row", alignItems: "center",
      borderRadius: theme.radii.md, padding: 14, marginBottom: 20,
    },
    shareLinkTitle: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    shareLinkSub: { fontSize: theme.fontSize.xs, marginTop: 2 },
    orDivider: { fontSize: theme.fontSize.xs, textAlign: "center", marginBottom: 12 },
    searchRow: {
      flexDirection: "row", alignItems: "center",
      borderRadius: theme.radii.sm, borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10, height: 44, marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: theme.fontSize.base },
    avatarSmall: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    avatarInitial: { fontSize: 15, fontFamily: theme.fonts.bodySemibold },
    resultRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultName: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodyMedium },
    resultUsername: { fontSize: theme.fontSize.sm, marginTop: 2 },
    addButton: {
      paddingHorizontal: 18, paddingVertical: 8,
      borderRadius: 20, minWidth: 60, alignItems: "center",
    },
    addButtonText: { color: "#fff", fontSize: theme.fontSize.sm, fontFamily: theme.fonts.bodySemibold },
    sentLabel: { fontSize: theme.fontSize.sm },
    noResults: { textAlign: "center", fontSize: theme.fontSize.sm, marginTop: 12 },
  });
}
