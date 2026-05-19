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
  TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { CloseButton } from "@/components/CloseButton";
import * as Haptics from "expo-haptics";
import { Collection } from "@/types";
import {
  convertCollectionToShared,
  deleteCollection,
  leaveCollection,
  fetchCollectionMembers,
  removeCollectionMember,
  renameCollection,
  searchUsersForCollection,
  sendCollectionInvite,
  fetchSentCollectionInvites,
  deleteCollectionInvite,
  CollectionMember,
  SentCollectionInvite,
} from "@/lib/collections";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { friendlyError } from "@/lib/errors";

const WEB_BASE_URL = "https://soundtracks.app";

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentCollectionInvite[]>([]);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(collection.name);
  const [savingRename, setSavingRename] = useState(false);

  // Invite member by username
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<{ id: string; displayName: string; username: string }[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const inviteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = collection.role === "owner";

  useEffect(() => {
    if (visible && isOwner) {
      setLoadingMembers(true);
      Promise.all([
        fetchCollectionMembers(collection.id),
        collection.isPublic ? fetchSentCollectionInvites(collection.id) : Promise.resolve([]),
      ])
        .then(([mems, invites]) => {
          setMembers(mems);
          setSentInvites(invites);
        })
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
    if (!visible) {
      setMembers([]);
      setSentInvites([]);
      setError("");
      setRenaming(false);
      setInviteQuery("");
      setInviteResults([]);
      setSentIds(new Set());
    }
  }, [visible, isOwner, collection.id, collection.isPublic]);

  // Debounced username search for invite
  useEffect(() => {
    if (inviteDebounce.current) clearTimeout(inviteDebounce.current);
    if (inviteQuery.trim().length < 2) {
      setInviteResults([]);
      setInviteSearching(false);
      return;
    }
    setInviteSearching(true);
    inviteDebounce.current = setTimeout(() => {
      const excludeIds = [
        collection.userId,
        user?.id ?? "",
        ...members.map((m) => m.userId),
        ...sentInvites.map((i) => i.inviteeId),
      ].filter(Boolean);
      searchUsersForCollection(inviteQuery.trim(), excludeIds)
        .then(setInviteResults)
        .catch(() => {})
        .finally(() => setInviteSearching(false));
    }, 350);
    return () => {
      if (inviteDebounce.current) clearTimeout(inviteDebounce.current);
    };
  }, [inviteQuery, members, sentInvites, collection.userId, user?.id]);

  const inviteUrl = collection.inviteCode
    ? `${WEB_BASE_URL}/c/${collection.inviteCode}`
    : null;

  async function handleRename() {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === collection.name || savingRename) return;
    setSavingRename(true);
    setError("");
    try {
      await renameCollection(collection.id, trimmed);
      onUpdated({ ...collection, name: trimmed });
      setRenaming(false);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSavingRename(false);
    }
  }

  async function handleInvite(result: { id: string; displayName: string; username: string }) {
    if (!user) return;
    setInvitingId(result.id);
    setError("");
    try {
      await sendCollectionInvite(collection.id, user.id, result.id);
      setSentIds((prev) => new Set([...prev, result.id]));
      setSentInvites((prev) => [...prev, { id: "", inviteeId: result.id, inviteeName: result.displayName, createdAt: new Date().toISOString() }]);
      // Clear search after a moment so user sees the "Invited" state
      setTimeout(() => {
        setInviteQuery("");
        setInviteResults([]);
        setSentIds(new Set());
      }, 1500);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setInvitingId(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setRevokingInviteId(inviteId);
    try {
      await deleteCollectionInvite(inviteId);
      setSentInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setRevokingInviteId(null);
    }
  }

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
              await supabase.functions.invoke("create-guest-user", {
                body: { collectionId: collection.id },
              });
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

  function handleDelete() {
    const memberWarning = members.length > 0
      ? ` ${members.length} member${members.length === 1 ? "" : "s"} will be removed.`
      : "";
    Alert.alert(
      "Delete Collection",
      `Permanently delete "${collection.name}"?${memberWarning} Moments added by members will remain on their timelines. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setDeleting(true);
            setError("");
            try {
              await deleteCollection(collection.id);
              onClose();
              onLeft(collection.id);
            } catch (e: any) {
              setError(friendlyError(e));
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  const totalMembers = members.length + 1; // +1 for owner

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

        {/* Header — inline rename for owners */}
        <View style={[styles.header, { paddingHorizontal: 20 }]}>
          {isOwner && renaming ? (
            <View style={styles.renameRow}>
              <TextInput
                style={[styles.renameInput, { color: theme.colors.text, backgroundColor: theme.colors.backgroundInput }]}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleRename}
                maxLength={60}
              />
              <TouchableOpacity
                onPress={handleRename}
                disabled={savingRename || !renameText.trim() || renameText.trim() === collection.name}
                hitSlop={8}
              >
                {savingRename ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Text style={[styles.renameSave, { color: theme.colors.accent, opacity: !renameText.trim() || renameText.trim() === collection.name ? 0.35 : 1 }]}>
                    Save
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRenaming(false); setRenameText(collection.name); }} hitSlop={8}>
                <Text style={[styles.renameCancel, { color: theme.colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
                {collection.name}
              </Text>
              {isOwner && (
                <TouchableOpacity
                  onPress={() => { setRenaming(true); setRenameText(collection.name); }}
                  hitSlop={8}
                  style={{ marginRight: 10 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
              <CloseButton onPress={onClose} />
            </>
          )}
        </View>

        {isOwner ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Metadata row */}
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
                    {collection.momentCount} {collection.momentCount === 1 ? "moment" : "moments"}
                    {collection.isPublic
                      ? ` · ${totalMembers} ${totalMembers === 1 ? "member" : "members"}`
                      : " · just you"}
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
              <>
                {/* Invite link */}
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
                  <View style={styles.linkButtonRow}>
                    <TouchableOpacity
                      style={[styles.linkButton, { backgroundColor: theme.colors.backgroundInput }]}
                      onPress={() => Clipboard.setStringAsync(inviteUrl)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="copy-outline" size={16} color={theme.colors.text} />
                      <Text style={[styles.linkButtonText, { color: theme.colors.text }]}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.shareButton, { backgroundColor: theme.colors.accent }]}
                      onPress={handleShare}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="share-outline" size={16} color="#fff" />
                      <Text style={styles.shareButtonText}>Share Link</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Invite member by username */}
                <View style={styles.addMemberSection}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>INVITE MEMBER</Text>
                  <View style={[styles.addMemberInputRow, { backgroundColor: theme.colors.backgroundInput }]}>
                    <Ionicons name="at-outline" size={16} color={theme.colors.placeholder} />
                    <TextInput
                      style={[styles.addMemberInput, { color: theme.colors.text }]}
                      placeholder="Search by username"
                      placeholderTextColor={theme.colors.placeholder}
                      value={inviteQuery}
                      onChangeText={setInviteQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    {inviteSearching && (
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    )}
                    {inviteQuery.length > 0 && !inviteSearching && (
                      <TouchableOpacity onPress={() => { setInviteQuery(""); setInviteResults([]); }} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={theme.colors.placeholder} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {inviteResults.map((result) => {
                    const wasSent = sentIds.has(result.id);
                    return (
                      <View key={result.id} style={[styles.addMemberResult, { borderBottomColor: theme.colors.backgroundInput }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.addMemberName, { color: theme.colors.text }]}>{result.displayName}</Text>
                          <Text style={[styles.addMemberUsername, { color: theme.colors.textSecondary }]}>@{result.username}</Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.addBtn,
                            { backgroundColor: wasSent ? theme.colors.chipBg : theme.colors.accent, opacity: invitingId === result.id ? 0.6 : 1 },
                          ]}
                          onPress={() => !wasSent && handleInvite(result)}
                          disabled={invitingId !== null || wasSent}
                          activeOpacity={0.7}
                        >
                          {invitingId === result.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : wasSent ? (
                            <Text style={[styles.addBtnText, { color: theme.colors.textSecondary }]}>Sent ✓</Text>
                          ) : (
                            <Text style={styles.addBtnText}>Invite</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {inviteQuery.trim().length >= 2 && !inviteSearching && inviteResults.length === 0 && (
                    <Text style={[styles.addMemberEmpty, { color: theme.colors.textTertiary }]}>No users found</Text>
                  )}
                </View>
              </>
            ) : (
              /* Personal: convert button */
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

            {/* Members list */}
            <View style={styles.membersSection}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
                MEMBERS
              </Text>
              {/* Owner row */}
              <View style={[styles.memberRow, { borderBottomColor: theme.colors.backgroundInput }]}>
                <Text style={[styles.memberName, { color: theme.colors.text }]}>You (owner)</Text>
              </View>
              {loadingMembers ? (
                <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  {members.map((member) => (
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
                          <Ionicons name="person-remove-outline" size={18} color={theme.colors.destructive ?? "#E53E3E"} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                  {/* Pending invites */}
                  {sentInvites.filter((i) => i.id).map((invite) => (
                    <View
                      key={invite.id}
                      style={[styles.memberRow, { borderBottomColor: theme.colors.backgroundInput }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.memberName, { color: theme.colors.textSecondary }]}>
                          {invite.inviteeName ?? "Unknown"}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 1 }}>
                          Invited · pending
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => invite.id && handleRevokeInvite(invite.id)}
                        disabled={revokingInviteId === invite.id}
                        hitSlop={8}
                      >
                        {revokingInviteId === invite.id ? (
                          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        ) : (
                          <Ionicons name="close-outline" size={18} color={theme.colors.textSecondary} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                  {members.length === 0 && sentInvites.filter((i) => i.id).length === 0 && (
                    <Text style={[styles.emptyMembers, { color: theme.colors.textTertiary }]}>
                      No one else has joined yet.
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Delete */}
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.buttonDisabled]}
              onPress={handleDelete}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator color={theme.colors.destructive} />
              ) : (
                <Text style={[styles.deleteButtonText, { color: theme.colors.destructive ?? "#E53E3E" }]}>
                  Delete Collection
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        ) : (
          /* Member view */
          <View style={styles.memberViewContent}>
            <View style={[styles.row, { borderBottomColor: theme.colors.backgroundInput }]}>
              <View style={styles.rowLeft}>
                <Ionicons name="people-outline" size={20} color={theme.colors.text} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Shared Collection</Text>
                  <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                    {collection.momentCount} {collection.momentCount === 1 ? "moment" : "moments"}
                    {collection.ownerName ? ` · by ${collection.ownerName}` : ""}
                  </Text>
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
    maxHeight: "88%",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
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
    fontFamily: "DMSans_700Bold",
    flex: 1,
    marginRight: 8,
  },
  renameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  renameInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  renameSave: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
  },
  renameCancel: {
    fontSize: 15,
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
    fontFamily: "DMSans_600SemiBold",
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
    gap: 10,
  },
  linkButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  linkButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
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
    fontFamily: "DMSans_600SemiBold",
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
    fontFamily: "DMSans_600SemiBold",
  },
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E53E3E",
    marginTop: 24,
  },
  deleteButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
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
    fontFamily: "DMSans_600SemiBold",
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
  // Add member
  addMemberSection: {
    marginTop: 24,
    gap: 8,
  },
  addMemberInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addMemberInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  addMemberResult: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addMemberName: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
  },
  addMemberUsername: {
    fontSize: 12,
    marginTop: 1,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 52,
    alignItems: "center",
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  addMemberEmpty: {
    fontSize: 13,
    paddingVertical: 8,
  },
  // Guest contributions
  guestSection: {
    marginTop: 24,
    gap: 10,
  },
  guestSubtext: {
    fontSize: 12,
    marginBottom: 2,
  },
  guestButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  guestButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  guestButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
  },
  qrButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  qrButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
});
