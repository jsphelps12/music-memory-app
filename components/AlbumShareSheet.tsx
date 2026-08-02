import {
  View,
  Text,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { confirmSheet } from "@/components/ConfirmSheet";
import * as Haptics from "expo-haptics";
import { Album } from "@/types";
import {
  convertAlbumToShared,
  deleteAlbum,
  leaveAlbum,
  fetchAlbumMembers,
  removeAlbumMember,
  renameAlbum,
  updateAlbumCover,
  AlbumMember,
} from "@/lib/albums";
import { uploadAlbumCover, getPublicPhotoThumbnailUrl } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { friendlyError } from "@/lib/errors";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { pluralMoments } from "@/lib/utils";

const WEB_BASE_URL = "https://soundtracks.app";

interface Props {
  visible: boolean;
  collection: Album;
  onClose: () => void;
  onUpdated: (updated: Album) => void;
  onLeft: (collectionId: string) => void;
}

export function AlbumShareSheet({ visible, collection, onClose, onUpdated, onLeft }: Props) {
  const theme = useTheme();
  const { user } = useAuth();

  const [converting, setConverting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(collection.name);
  const [savingRename, setSavingRename] = useState(false);

  // Cover photo state
  const [uploadingCover, setUploadingCover] = useState(false);

  // Invite member by username

  const queryClient = useQueryClient();
  const isOwner = collection.role === "owner";

  useEffect(() => {
    if (visible && isOwner) {
      setLoadingMembers(true);
      fetchAlbumMembers(collection.id)
        .then(setMembers)
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
    if (!visible) {
      setMembers([]);
      setError("");
      setRenaming(false);
    }
  }, [visible, isOwner, collection.id, collection.isPublic]);

  const inviteUrl = collection.inviteCode
    ? `${WEB_BASE_URL}/c/${collection.inviteCode}`
    : null;

  async function handleRename() {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === collection.name || savingRename) return;
    setSavingRename(true);
    setError("");
    try {
      await renameAlbum(collection.id, trimmed);
      onUpdated({ ...collection, name: trimmed });
      invalidateAlbumCaches(queryClient, user?.id, collection.id);
      setRenaming(false);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSavingRename(false);
    }
  }

  async function handlePickCover() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingCover(true);
    setError("");
    try {
      const path = await uploadAlbumCover(user.id, collection.id, result.assets[0].uri);
      await updateAlbumCover(collection.id, path);
      onUpdated({ ...collection, coverPhotoUrl: path });
      invalidateAlbumCaches(queryClient, user.id, collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleRemoveCover() {
    setError("");
    try {
      await updateAlbumCover(collection.id, null);
      onUpdated({ ...collection, coverPhotoUrl: undefined });
      invalidateAlbumCaches(queryClient, user?.id, collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
    }
  }

  async function handleConvert() {
    const confirmed = await confirmSheet({
      title: "Make Shared?",
      message: "Anyone with the invite link can join and add moments. This can't be undone.",
      confirmLabel: "Make Shared",
    });
    if (!confirmed) return;
    setConverting(true);
    setError("");
    try {
      await convertAlbumToShared(collection.id);
      await supabase.functions.invoke("create-guest-user", {
        body: { collectionId: collection.id },
      });
      onUpdated({ ...collection, isPublic: true });
      invalidateAlbumCaches(queryClient, user?.id, collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setConverting(false);
    }
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

  async function handleRemoveMember(member: AlbumMember) {
    const confirmed = await confirmSheet({
      title: "Remove Member",
      message: `Remove ${member.displayName ?? "this member"} from "${collection.name}"?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setRemovingMemberId(member.userId);
    setError("");
    try {
      await removeAlbumMember(collection.id, member.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleLeave() {
    const confirmed = await confirmSheet({
      title: "Leave Album",
      message: `Leave "${collection.name}"? You can rejoin later with the invite link.`,
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!confirmed || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLeaving(true);
    setError("");
    try {
      await leaveAlbum(collection.id, user.id);
      invalidateAlbumCaches(queryClient, user.id, collection.id);
      onClose();
      onLeft(collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
      setLeaving(false);
    }
  }

  async function handleDelete() {
    const memberWarning = members.length > 0
      ? ` ${members.length} member${members.length === 1 ? "" : "s"} will be removed.`
      : "";
    const confirmed = await confirmSheet({
      title: "Delete Album",
      message: `Permanently delete "${collection.name}"?${memberWarning} Moments added by members will remain on their timelines. This can't be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleting(true);
    setError("");
    try {
      await deleteAlbum(collection.id);
      invalidateAlbumCaches(queryClient, user?.id, collection.id);
      onClose();
      onLeft(collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
      setDeleting(false);
    }
  }

  const totalMembers = members.length + 1; // +1 for owner

  return (
    <BottomSheet visible={visible} onClose={onClose} keyboardAvoiding maxHeight="88%">
      {/* Header — inline rename for owners (custom, so no BottomSheet title) */}
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
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : (
                <Text style={[styles.renameSave, { color: theme.colors.text, opacity: !renameText.trim() || renameText.trim() === collection.name ? 0.35 : 1 }]}>
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
                    {pluralMoments(collection.momentCount)}
                    {collection.isPublic
                      ? ` · ${totalMembers} ${totalMembers === 1 ? "member" : "members"}`
                      : " · just you"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Cover photo row — owners only */}
            <View style={[styles.row, { borderBottomColor: theme.colors.backgroundInput }]}>
              <View style={styles.rowLeft}>
                <Ionicons name="image-outline" size={20} color={theme.colors.text} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Cover Photo</Text>
                  <TouchableOpacity onPress={handlePickCover} disabled={uploadingCover} hitSlop={4}>
                    <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                      {collection.coverPhotoUrl ? "Change photo" : "Add a cover photo"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {uploadingCover ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : collection.coverPhotoUrl ? (
                <TouchableOpacity
                  onLongPress={handleRemoveCover}
                  onPress={handlePickCover}
                  activeOpacity={0.8}
                  hitSlop={4}
                >
                  <AppImage
                    source={{ uri: getPublicPhotoThumbnailUrl(collection.coverPhotoUrl) }}
                    style={styles.coverThumb}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handlePickCover}
                  style={[styles.coverPlaceholder, { backgroundColor: theme.colors.backgroundInput, borderColor: theme.colors.border }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
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
                      style={[styles.shareButton, { backgroundColor: theme.colors.buttonBg }]}
                      onPress={handleShare}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="share-outline" size={16} color={theme.colors.buttonText} />
                      <Text style={[styles.shareButtonText, { color: theme.colors.buttonText }]}>Share Link</Text>
                    </TouchableOpacity>
                  </View>
                </View>

              </>
            ) : (
              /* Personal: convert button */
              <View style={styles.shareSection}>
                <TouchableOpacity
                  style={[
                    styles.convertButton,
                    { backgroundColor: theme.colors.buttonBg, borderColor: "transparent" },
                    converting && styles.buttonDisabled,
                  ]}
                  onPress={handleConvert}
                  disabled={converting}
                  activeOpacity={0.8}
                >
                  {converting ? (
                    <ActivityIndicator color={theme.colors.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="people-outline" size={16} color={theme.colors.buttonText} />
                      <Text style={[styles.convertButtonText, { color: theme.colors.buttonText }]}>
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
                <ActivityIndicator size="small" color={theme.colors.textSecondary} style={{ marginVertical: 12 }} />
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
                  {members.length === 0 && (
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
                  Delete Album
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
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Shared Album</Text>
                  <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                    {pluralMoments(collection.momentCount)}
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
                    Leave Album
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
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
  coverThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  coverPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
