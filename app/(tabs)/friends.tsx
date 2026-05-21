import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NewSharedCollectionModal } from "@/components/NewSharedCollectionModal";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  Dimensions,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { EmptyState } from "@/components/EmptyState";
import { getPublicPhotoThumbnailUrl } from "@/lib/storage";
import {
  fetchCollections,
  fetchSharedCollectionActivity,
  fetchPendingCollectionInvites,
  acceptCollectionInvite,
  deleteCollectionInvite,
  CollectionInvite,
  SharedCollectionActivity,
} from "@/lib/collections";
import { Collection } from "@/types";
import { friendlyError } from "@/lib/errors";

const GRID_GAP = 12;
const SCREEN_PAD = 16;
const CELL_SIZE = (Dimensions.get("window").width - SCREEN_PAD * 2 - GRID_GAP) / 2;

// ── Data ──────────────────────────────────────────────────────────────────────

async function fetchCollectionsScreen(userId: string) {
  const [collections, sharedActivity, invites] = await Promise.all([
    fetchCollections(userId),
    fetchSharedCollectionActivity(userId),
    fetchPendingCollectionInvites(userId).catch(() => [] as CollectionInvite[]),
  ]);
  const activityMap = new Map(sharedActivity.map((a) => [a.collectionId, a.newMomentCount]));
  return { collections, activityMap, invites };
}

// ── Collection cell ───────────────────────────────────────────────────────────

function CollectionCell({
  collection,
  newCount,
  onPress,
  theme,
}: {
  collection: Collection;
  newCount: number;
  onPress: () => void;
  theme: any;
}) {
  const thumbUrl = collection.coverPhotoUrl
    ? getPublicPhotoThumbnailUrl(collection.coverPhotoUrl, Math.round(CELL_SIZE * 2), true)
    : null;

  return (
    <TouchableOpacity style={styles.cell} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cellArt}>
        {thumbUrl ? (
          <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#E8825C", "#6B5F8C"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cellPlaceholderInner}>
              <Ionicons name="albums-outline" size={32} color="rgba(255,255,255,0.8)" />
            </View>
          </LinearGradient>
        )}
        {newCount > 0 && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{newCount} new</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cellName, { color: theme.colors.text }]} numberOfLines={1}>
        {collection.name}
      </Text>
      <Text style={[styles.cellSub, { color: theme.colors.textSecondary }]} numberOfLines={1}>
        {collection.role === "member" && collection.ownerName
          ? `by ${collection.ownerName} · ${collection.momentCount} ${collection.momentCount === 1 ? "moment" : "moments"}`
          : collection.isPublic
          ? `Shared · ${collection.momentCount} ${collection.momentCount === 1 ? "moment" : "moments"}`
          : `${collection.momentCount} ${collection.momentCount === 1 ? "moment" : "moments"}`}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CollectionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const styles2 = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [newCollectionVisible, setNewCollectionVisible] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["collectionsScreen", user?.id],
    queryFn: () => fetchCollectionsScreen(user!.id),
    staleTime: 2 * 60 * 1000,
    enabled: !!user,
  });

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const collections = data?.collections ?? [];
  const activityMap = data?.activityMap ?? new Map();
  const invites = data?.invites ?? [];

  const personalCollections = useMemo(
    () => collections.filter((c) => c.role === "owner" && !c.isPublic),
    [collections]
  );
  const sharedCollections = useMemo(
    () => collections.filter((c) => c.role === "owner" && c.isPublic || c.role === "member"),
    [collections]
  );

  const handleAcceptInvite = useCallback(async (invite: CollectionInvite) => {
    if (!user) return;
    setRespondingInviteId(invite.id);
    try {
      await acceptCollectionInvite(invite.id, invite.collectionId, user.id);
      queryClient.invalidateQueries({ queryKey: ["collectionsScreen", user.id] });
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
      queryClient.setQueryData(["collectionsScreen", user?.id], (old: any) =>
        old ? { ...old, invites: old.invites.filter((i: CollectionInvite) => i.id !== inviteId) } : old
      );
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setRespondingInviteId(null);
    }
  }, [user, queryClient]);

  const handleTapCollection = useCallback((col: Collection) => {
    router.push({ pathname: "/collection/[id]" as any, params: { id: col.id } });
  }, [router]);

  const handleNewCollectionClose = useCallback(() => {
    setNewCollectionVisible(false);
    queryClient.invalidateQueries({ queryKey: ["collectionsScreen", user?.id] });
  }, [queryClient, user?.id]);

  if (isLoading) {
    return (
      <View style={[styles2.container, styles2.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  const isEmpty = personalCollections.length === 0 && sharedCollections.length === 0 && invites.length === 0;

  type SectionItem =
    | { type: "invites" }
    | { type: "sectionHeader"; label: string }
    | { type: "row"; items: Collection[] };

  const listData: SectionItem[] = [];
  if (invites.length > 0) listData.push({ type: "invites" });

  if (personalCollections.length > 0) {
    listData.push({ type: "sectionHeader", label: "MY COLLECTIONS" });
    for (let i = 0; i < personalCollections.length; i += 2) {
      listData.push({ type: "row", items: personalCollections.slice(i, i + 2) });
    }
  }
  if (sharedCollections.length > 0) {
    listData.push({ type: "sectionHeader", label: "SHARED" });
    for (let i = 0; i < sharedCollections.length; i += 2) {
      listData.push({ type: "row", items: sharedCollections.slice(i, i + 2) });
    }
  }

  return (
    <View style={[styles2.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles2.header, { borderBottomColor: theme.colors.border }]}>
        <Text style={[styles2.headerTitle, { color: theme.colors.text }]}>Collections</Text>
        <TouchableOpacity onPress={() => setNewCollectionVisible(true)} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={26} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <EmptyState
          icon="albums-outline"
          title="No collections yet"
          subtitle="Create a collection to organize your moments, or join a shared collection with friends."
          action={{ label: "Create Collection", onPress: () => setNewCollectionVisible(true) }}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => `${item.type}-${i}`}
          contentContainerStyle={styles2.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={theme.colors.accent} />
          }
          renderItem={({ item }) => {
            if (item.type === "invites") {
              return (
                <View style={[styles2.inviteCard, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
                  {invites.map((invite, i) => (
                    <View key={invite.id} style={[styles2.inviteRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                      <View style={[styles2.inviteIcon, { backgroundColor: theme.colors.accentSecondaryBg }]}>
                        <Ionicons name="people-outline" size={16} color={theme.colors.accentSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles2.inviteName, { color: theme.colors.text }]} numberOfLines={1}>
                          {invite.collectionName}
                        </Text>
                        {invite.inviterName ? (
                          <Text style={[styles2.inviteSub, { color: theme.colors.textSecondary }]}>
                            Invited by {invite.inviterName}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles2.inviteActions}>
                        <TouchableOpacity
                          style={[styles2.inviteBtn, { borderColor: theme.colors.border }]}
                          onPress={() => handleDeclineInvite(invite.id)}
                          disabled={respondingInviteId === invite.id}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles2.inviteBtnText, { color: theme.colors.textSecondary }]}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles2.inviteBtn, styles2.inviteBtnAccept, { backgroundColor: theme.colors.accentSecondary }]}
                          onPress={() => handleAcceptInvite(invite)}
                          disabled={respondingInviteId === invite.id}
                          activeOpacity={0.8}
                        >
                          {respondingInviteId === invite.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={[styles2.inviteBtnText, { color: "#fff" }]}>Accept</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              );
            }

            if (item.type === "sectionHeader") {
              return (
                <Text style={[styles2.sectionLabel, { color: theme.colors.textTertiary }]}>
                  {item.label}
                </Text>
              );
            }

            // row
            return (
              <View style={styles2.gridRow}>
                {item.items.map((col) => (
                  <CollectionCell
                    key={col.id}
                    collection={col}
                    newCount={activityMap.get(col.id) ?? 0}
                    onPress={() => handleTapCollection(col)}
                    theme={theme}
                  />
                ))}
                {item.items.length === 1 && <View style={styles2.cell} />}
              </View>
            );
          }}
        />
      )}

      <NewSharedCollectionModal
        visible={newCollectionVisible}
        onClose={handleNewCollectionClose}
        userId={user?.id ?? ""}
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
      paddingHorizontal: SCREEN_PAD,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
    },
    listContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: 16,
      paddingBottom: 40,
      gap: 0,
    },
    sectionLabel: {
      fontSize: 10,
      fontFamily: theme.fonts.bodyBold,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginTop: 20,
      marginBottom: 10,
    },
    gridRow: {
      flexDirection: "row",
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    // Invite card
    inviteCard: {
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
      marginBottom: 8,
    },
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 10,
    },
    inviteIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    inviteName: {
      fontSize: 14,
      fontFamily: theme.fonts.bodySemibold,
    },
    inviteSub: {
      fontSize: 12,
      marginTop: 1,
    },
    inviteActions: {
      flexDirection: "row",
      gap: 8,
    },
    inviteBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: "center",
    },
    inviteBtnAccept: {
      borderWidth: 0,
    },
    inviteBtnText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
    },
  });
}

const styles = StyleSheet.create({
  cell: {
    width: CELL_SIZE,
  },
  cellArt: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  cellPlaceholderInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#E8825C",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
  },
  cellName: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    marginTop: 7,
  },
  cellSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
