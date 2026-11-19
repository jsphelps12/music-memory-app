import {
  View,
  Text,
  Share,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Icon } from "@/components/Icon";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { ListRow } from "@/components/ListRow";
import { PersonPicker, pickerHasSearch, type PickerPerson } from "@/components/PersonPicker";
import { TextField } from "@/components/TextField";
import * as Haptics from "expo-haptics";
import { Album } from "@/types";
import {
  albumCoverKey,
  albumNeedsGuestUser,
  convertAlbumToShared,
  deleteAlbum,
  ensureAlbumGuestUser,
  leaveAlbum,
  fetchAlbumMembers,
  removeAlbumMember,
  renameAlbum,
  updateAlbumCover,
  AlbumMember,
} from "@/lib/albums";
import { uploadAlbumCover, getPublicPhotoUrl } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();

  const [converting, setConverting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // A failed load says so; it must not read as "No one else has joined yet".
  const [membersError, setMembersError] = useState("");
  // "Show all" swaps the sheet's content for the whole member list.
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showAllQuery, setShowAllQuery] = useState("");
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(collection.name);
  const [savingRename, setSavingRename] = useState(false);

  // Cover photo state
  const [uploadingCover, setUploadingCover] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);

  const queryClient = useQueryClient();
  const isOwner = collection.role === "owner";

  const loadMembers = useCallback(() => {
    setLoadingMembers(true);
    setMembersError("");
    fetchAlbumMembers(collection.id)
      .then(setMembers)
      .catch((e) => setMembersError(friendlyError(e)))
      .finally(() => setLoadingMembers(false));
  }, [collection.id]);

  useEffect(() => {
    if (visible && isOwner) loadMembers();
    if (!visible) {
      setMembers([]);
      setMembersError("");
      setShowAllMembers(false);
      setError("");
      setRenaming(false);
      setLinkCopied(false);
    }
  }, [visible, isOwner, loadMembers, collection.isPublic]);

  const memberPeople = useMemo(
    () =>
      members.map(
        (m): PickerPerson & { member: AlbumMember } => ({
          id: m.userId,
          displayName: m.displayName,
          username: m.username,
          avatarPath: m.avatarUrl,
          member: m,
        })
      ),
    [members]
  );

  // A shared album whose guest-user setup failed (or that was created shared
  // before the create sheet did it) is finished here, quietly: the owner
  // opening the sheet is the retry. Nothing to show if it fails again.
  useEffect(() => {
    if (!visible || !isOwner || !collection.isPublic) return;
    let cancelled = false;
    albumNeedsGuestUser(collection.id)
      .then((needed) => (needed && !cancelled ? ensureAlbumGuestUser(collection.id) : undefined))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
      // Square, like everywhere the cover shows (AlbumMosaic, the album
      // screen) and the create sheet's picker; it used to crop 16:9.
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingCover(true);
    setError("");
    try {
      // A new name per upload, so the new cover gets a new URL; the old
      // object is deleted once the album points at the new one.
      const path = await uploadAlbumCover(user.id, albumCoverKey(collection.id), result.assets[0].uri);
      await updateAlbumCover(collection.id, path, collection.coverPhotoUrl);
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
      await updateAlbumCover(collection.id, null, collection.coverPhotoUrl);
      onUpdated({ ...collection, coverPhotoUrl: undefined });
      invalidateAlbumCaches(queryClient, user?.id, collection.id);
    } catch (e: any) {
      setError(friendlyError(e));
    }
  }

  async function handleConvert() {
    const confirmed = await confirmSheet({
      title: "Make this album shared?",
      message: "Anyone with the invite link can join and add moments. This can't be undone.",
      confirmLabel: "Make shared",
    });
    if (!confirmed) return;
    setConverting(true);
    setError("");
    try {
      await convertAlbumToShared(collection.id);
      // The album is shared from here on. A failed guest-user setup doesn't
      // undo that: the effect above retries it once the sheet sees the album
      // as shared, and again whenever the owner opens the sheet.
      await ensureAlbumGuestUser(collection.id).catch((e) => {
        if (__DEV__) console.warn("[albums] guest user setup failed:", e);
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

  async function handleCopyLink() {
    if (!inviteUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleRemoveMember(member: AlbumMember) {
    const confirmed = await confirmSheet({
      title: `Remove ${member.displayName ?? "this member"}?`,
      message: `They'll leave “${collection.name}”.`,
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
      title: "Leave this album?",
      message: `You can rejoin “${collection.name}” later with the invite link.`,
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
      title: "Delete this album?",
      message: `“${collection.name}” will be deleted for good.${memberWarning} Moments added by members will remain on their timelines.`,
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

  // Members in join order; Remove on each row.
  const memberPickerProps = {
    people: memberPeople,
    loading: loadingMembers,
    error: membersError || undefined,
    onRetry: loadMembers,
    emptyState: (
      <View style={styles.row}>
        <Text style={styles.emptyMembers}>No one else has joined yet.</Text>
      </View>
    ),
    searchPlaceholder: "Search members",
    renderTrailing: (person: (typeof memberPeople)[number]) =>
      removingMemberId === person.id ? (
        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
      ) : (
        <IconButton
          name="person-remove-outline"
          size={18}
          color={theme.colors.textSecondary}
          onPress={() => handleRemoveMember(person.member)}
          accessibilityLabel={`Remove ${person.displayName ?? person.username ?? "member"}`}
          style={styles.memberAction}
        />
      ),
  };
  const renameDirty = !!renameText.trim() && renameText.trim() !== collection.name;

  const metaLine = isOwner
    ? `${pluralMoments(collection.momentCount)} · ${
        collection.isPublic
          ? `${totalMembers} ${totalMembers === 1 ? "member" : "members"}`
          : "just you"
      }`
    : `Shared album · ${pluralMoments(collection.momentCount)}${
        collection.ownerName ? ` · by ${collection.ownerName}` : ""
      }`;

  // Design sweep (2026-11): the sheet's own serif title is the album name (it
  // used to draw a second title row), rename lives in a row, the invite link
  // is a quiet Meta line, and the actions are the shared Button. Sized to
  // content; a long member list scrolls inside the sheet's default cap.
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={collection.name}
      keyboardAvoiding
      // Steady height while searching the whole list.
      minHeight={showAllMembers && pickerHasSearch(memberPeople.length) ? "75%" : undefined}
    >
      {showAllMembers ? (
        <View style={styles.allMembers}>
          <Button
            variant="text"
            size="pill"
            tone="secondary"
            icon="chevron-back"
            label="Back"
            onPress={() => setShowAllMembers(false)}
            accessibilityLabel="Back to album settings"
            style={styles.back}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <SectionLabel meta={String(totalMembers)}>Members</SectionLabel>
          <PersonPicker mode="list" {...memberPickerProps} initialQuery={showAllQuery} />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={styles.meta}>{metaLine}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isOwner ? (
          <>
            {collection.isPublic && inviteUrl ? (
              <View style={styles.inviteBlock}>
                <View style={styles.linkRow}>
                  <Icon name="link-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
                    {inviteUrl.replace(/^https?:\/\//, "")}
                  </Text>
                  <Button
                    variant="text"
                    size="pill"
                    label={linkCopied ? "Copied" : "Copy"}
                    onPress={handleCopyLink}
                    accessibilityLabel="Copy invite link"
                  />
                </View>
                <Button label="Share invite link" icon="share-outline" onPress={handleShare} />
              </View>
            ) : (
              <Button
                label="Make shared"
                icon="people-outline"
                onPress={handleConvert}
                loading={converting}
                style={styles.inviteBlock}
              />
            )}

            <View style={styles.rows}>
              {/* Name, renamed inline */}
              {renaming ? (
                <View style={styles.renameRow}>
                  <TextField
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleRename}
                    maxLength={60}
                    accessibilityLabel="Album name"
                    containerStyle={styles.renameField}
                  />
                  <Button
                    variant="text"
                    size="pill"
                    label="Save"
                    onPress={handleRename}
                    loading={savingRename}
                    disabled={!renameDirty}
                  />
                  <Button
                    variant="text"
                    size="pill"
                    tone="secondary"
                    label="Cancel"
                    onPress={() => {
                      setRenaming(false);
                      setRenameText(collection.name);
                    }}
                  />
                </View>
              ) : (
                <ListRow
                  label="Name"
                  detail={collection.name}
                  onPress={() => {
                    setRenaming(true);
                    setRenameText(collection.name);
                  }}
                  accessibilityLabel="Rename album"
                  style={styles.rowTight}
                />
              )}

              {/* Cover photo: tap to change; Remove clears it */}
              <ListRow
                label="Cover photo"
                onPress={handlePickCover}
                disabled={uploadingCover}
                accessibilityHint={collection.coverPhotoUrl ? "Change cover photo" : "Add a cover photo"}
                style={styles.rowTight}
                trailing={
                  <View style={styles.rowTrailing}>
                    {uploadingCover ? (
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : collection.coverPhotoUrl ? (
                      <>
                        <Button
                          variant="text"
                          size="pill"
                          tone="secondary"
                          label="Remove"
                          align="center"
                          onPress={handleRemoveCover}
                          accessibilityLabel="Remove cover photo"
                        />
                        <Pressable
                          onPress={handlePickCover}
                          accessibilityRole="button"
                          accessibilityLabel="Change cover photo"
                        >
                          <AppImage
                            source={{ uri: getPublicPhotoUrl(collection.coverPhotoUrl) }}
                            style={styles.coverThumb}
                            contentFit="cover"
                          />
                        </Pressable>
                      </>
                    ) : (
                      <View style={[styles.coverThumb, styles.coverEmpty]}>
                        <Icon name="image-outline" size={18} color={theme.colors.textSecondary} />
                      </View>
                    )}
                  </View>
                }
              />
            </View>

            {/* Members: only a shared album can have any */}
            {collection.isPublic ? (
              <View style={styles.section}>
                <SectionLabel meta={loadingMembers || membersError ? undefined : String(totalMembers)}>
                  Members
                </SectionLabel>
                <View style={[styles.rows, styles.rowsTight]}>
                  <ListRow label="You" detail="Owner" style={styles.rowTight} />
                  <PersonPicker
                    mode="inline"
                    {...memberPickerProps}
                    onShowAll={(query) => {
                      setShowAllQuery(query);
                      setShowAllMembers(true);
                    }}
                  />
                </View>
              </View>
            ) : null}

            <Button
              variant="text"
              tone="destructive"
              label="Delete album"
              onPress={handleDelete}
              loading={deleting}
              fullWidth
              style={styles.endAction}
            />
          </>
        ) : (
          <Button
            variant="text"
            tone="destructive"
            label="Leave album"
            onPress={handleLeave}
            loading={leaving}
            fullWidth
            style={styles.endAction}
          />
        )}
      </ScrollView>
      )}
      {/* Local confirm host: a root-level Modal can't present over this open
          sheet (iOS silently drops it), so confirms asked from in here need a
          host nested inside the sheet's own Modal hierarchy. */}
      <ConfirmSheetHost />
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    meta: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
      marginTop: theme.spacing.sm,
    },
    inviteBlock: {
      marginTop: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    // The link as a quiet line of Meta between hairlines, not a monospaced box.
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      minHeight: 44,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.divider,
    },
    linkText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    section: {
      marginTop: theme.spacing.xl,
    },
    rows: {
      marginTop: theme.spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    rowsTight: {
      marginTop: theme.spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 52,
      paddingVertical: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    // ListRow in this sheet keeps the old 52pt rhythm with a 36pt thumb.
    rowTight: {
      paddingVertical: theme.spacing.xs,
    },
    rowTrailing: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: theme.spacing.sm,
    },
    renameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    renameField: {
      flex: 1,
      minHeight: 40,
    },
    coverThumb: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
    },
    coverEmpty: {
      backgroundColor: theme.colors.artworkPlaceholder,
      alignItems: "center",
      justifyContent: "center",
    },
    memberAction: {
      marginRight: -12,
    },
    allMembers: {
      flexShrink: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    back: {
      alignSelf: "flex-start",
      marginLeft: -theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    emptyMembers: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
    },
    endAction: {
      marginTop: theme.spacing.lg,
    },
  });
}
