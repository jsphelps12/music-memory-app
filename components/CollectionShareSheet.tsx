import {
  View,
  Text,
  Modal,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { Collection } from "@/types";
import {
  convertCollectionToShared,
  leaveCollection,
  fetchCollectionMembers,
  removeCollectionMember,
  CollectionMember,
} from "@/lib/collections";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { friendlyError } from "@/lib/errors";

const WEB_BASE_URL = "https://music-memory-app.vercel.app";
const BRANCH_DOMAIN = process.env.EXPO_PUBLIC_BRANCH_DOMAIN ?? "tracks.app.link";

function buildInviteLink(inviteCode: string, collectionName: string): string {
  // Branch long link: tries to open app if installed, deferred deep link after fresh install,
  // falls back to the web collection preview page otherwise.
  const params = [
    `inviteCode=${encodeURIComponent(inviteCode)}`,
    `%24deeplink_path=${encodeURIComponent(`join?inviteCode=${inviteCode}`)}`,
    `%24fallback_url=${encodeURIComponent(`${WEB_BASE_URL}/c/${inviteCode}`)}`,
    `%24og_title=${encodeURIComponent(`Join "${collectionName}" on Tracks`)}`,
    `%24og_description=${encodeURIComponent("A shared music memory collection")}`,
  ].join("&");
  return `https://${BRANCH_DOMAIN}/?${params}`;
}

interface Props {
  visible: boolean;
  collection: Collection;
  onClose: () => void;
  onUpdated: (updated: Collection) => void;
  onLeft: (collectionId: string) => void;
}

export function CollectionShareSheet({ visible, collection, onClose, onUpdated, onLeft }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const [converting, setConverting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isOwner = collection.role === "owner";

  useEffect(() => {
    if (visible && isOwner) {
      setLoadingMembers(true);
      fetchCollectionMembers(collection.id)
        .then(setMembers)
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
    if (!visible) {
      setMembers([]);
      setError("");
    }
  }, [visible, isOwner, collection.id]);

  const inviteUrl = collection.inviteCode
    ? buildInviteLink(collection.inviteCode, collection.name)
    : null;

  function handleConvert() {
    Alert.alert(
      "Make Shared?",
      "Anyone with the invite link can join and add moments. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Shared",
          onPress: async () => {
            setConverting(true);
            setError("");
            try {
              await convertCollectionToShared(collection.id);
              onUpdated({ ...collection, isPublic: true });
            } catch (e: any) {
              setError(friendlyError(e));
            } finally {
              setConverting(false);
            }
          },
        },
      ]
    );
  }

  async function handleShare() {
    if (!inviteUrl) return;
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { url: inviteUrl }
          : { message: inviteUrl }
      );
    } catch {}
  }

  function handleRemoveMember(member: CollectionMember) {
    Alert.alert(
      "Remove Member",
      `Remove ${member.displayName ?? "this member"} from "${collection.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingMemberId(member.userId);
            setError("");
            try {
              await removeCollectionMember(collection.id, member.userId);
              setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
            } catch (e: any) {
              setError(friendlyError(e));
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  }

  function handleLeave() {
    Alert.alert(
      "Leave Collection",
      `Leave "${collection.name}"? You can rejoin later with the invite link.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setLeaving(true);
            setError("");
            try {
              await leaveCollection(collection.id, user.id);
              onClose();
              onLeft(collection.id);
            } catch (e: any) {
              setError(friendlyError(e));
              setLeaving(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: theme.colors.textSecondary }]} />

        {/* Header */}
        <View style={[styles.header, { paddingHorizontal: 20 }]}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {collection.name}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isOwner ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Info row */}
            <View style={[styles.row, { borderBottomColor: theme.colors.backgroundInput }]}>
              <View style={styles.rowLeft}>
                <Ionicons
                  name={collection.isPublic ? "people-outline" : "lock-closed-outline"}
                  size={20}
                  color={theme.colors.text}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>
                    {collection.isPublic ? "Shared Collection" : "Personal Collection"}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                    {collection.isPublic
                      ? "Anyone with the link can join and add moments."
                      : "Just for you — private and not shareable."}
                  </Text>
                </View>
              </View>
            </View>

            {error ? (
              <Text style={[styles.error, { color: theme.colors.destructive ?? "#E53E3E" }]}>
                {error}
              </Text>
            ) : null}

            {collection.isPublic && inviteUrl ? (
              /* Shared: show invite link + share button */
              <View style={styles.shareSection}>
                <View style={[styles.urlBox, { backgroundColor: theme.colors.backgroundInput }]}>
                  <Text
                    style={[styles.urlText, { color: theme.colors.textSecondary }]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {inviteUrl}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.shareButton, { backgroundColor: theme.colors.accent }]}
                  onPress={handleShare}
                  activeOpacity={0.8}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.shareButtonText}>Share Invite Link</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Personal: one-way convert button */
              <View style={styles.shareSection}>
                <TouchableOpacity
                  style={[
                    styles.convertButton,
                    { borderColor: theme.colors.accent },
                    converting && styles.buttonDisabled,
                  ]}
                  onPress={handleConvert}
                  disabled={converting}
                  activeOpacity={0.8}
                >
                  {converting ? (
                    <ActivityIndicator color={theme.colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="people-outline" size={16} color={theme.colors.accent} />
                      <Text style={[styles.convertButtonText, { color: theme.colors.accent }]}>
                        Convert to Shared
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Members section */}
            <View style={styles.membersSection}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
                MEMBERS
              </Text>
              {loadingMembers ? (
                <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginVertical: 12 }} />
              ) : members.length === 0 ? (
                <Text style={[styles.emptyMembers, { color: theme.colors.textTertiary }]}>
                  No one has joined yet.
                </Text>
              ) : (
                members.map((member) => (
                  <View
                    key={member.userId}
                    style={[styles.memberRow, { borderBottomColor: theme.colors.backgroundInput }]}
                  >
                    <Text style={[styles.memberName, { color: theme.colors.text }]}>
                      {member.displayName ?? "Unknown"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(member)}
                      disabled={removingMemberId === member.userId}
                      hitSlop={8}
                    >
                      {removingMemberId === member.userId ? (
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                      ) : (
                        <Ionicons
                          name="person-remove-outline"
                          size={18}
                          color={theme.colors.destructive ?? "#E53E3E"}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.memberViewContent}>
            {/* Member view */}
            <View style={[styles.row, { borderBottomColor: theme.colors.backgroundInput }]}>
              <View style={styles.rowLeft}>
                <Ionicons name="people-outline" size={20} color={theme.colors.text} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Shared Collection</Text>
                  {collection.ownerName ? (
                    <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                      Created by {collection.ownerName}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {error ? (
              <Text style={[styles.error, { color: theme.colors.destructive ?? "#E53E3E" }]}>
                {error}
              </Text>
            ) : null}

            <View style={styles.shareSection}>
              <TouchableOpacity
                style={[
                  styles.leaveButton,
                  { borderColor: theme.colors.destructive ?? "#E53E3E" },
                  leaving && styles.buttonDisabled,
                ]}
                onPress={handleLeave}
                disabled={leaving}
                activeOpacity={0.8}
              >
                {leaving ? (
                  <ActivityIndicator color={theme.colors.destructive} />
                ) : (
                  <Text style={[styles.leaveButtonText, { color: theme.colors.destructive ?? "#E53E3E" }]}>
                    Leave Collection
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
    opacity: 0.3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    fontSize: 13,
    marginTop: 8,
  },
  shareSection: {
    marginTop: 20,
    gap: 12,
  },
  urlBox: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  urlText: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  leaveButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  leaveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  convertButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  convertButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  memberViewContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  membersSection: {
    marginTop: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  emptyMembers: {
    fontSize: 14,
    marginVertical: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberName: {
    fontSize: 15,
  },
});
