import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Share,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import * as Clipboard from "expo-clipboard";
import { AppImage } from "@/components/AppImage";
import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { SectionLabel } from "@/components/SectionLabel";
import { fetchFriends } from "@/lib/friends";
import {
  ensureShareToken,
  fetchMomentShareRecipients,
  MomentShareGrant,
  momentShareUrl,
  friendInviteUrl,
  removeMomentShare,
  sendMomentShare,
} from "@/lib/momentShares";
import { fetchAlbumIdsContainingMoment } from "@/lib/albums";
import { fetchAlbums, removeMomentFromAlbum } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { getPublicPhotoUrl } from "@/lib/storage";
import { setShareCardData } from "@/lib/shareCardStore";
import { friendlyError } from "@/lib/errors";
import { Friendship, PartialMoment } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AlbumGrant {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  moment: PartialMoment;
  photoUrls: string[];
  onClose: () => void;
  /**
   * Hands "Add to album" off to the host's existing album-membership sheet
   * (the detail screen owns that flow). Row hidden when absent.
   */
  onAddToAlbum?: () => void;
}

// Sharing v2 Phase D (docs/SOCIAL-ARCHITECTURE.md "Surfaces"): the one social
// surface — three verbs (Send to a person · Add to album · Share a link) plus
// honest state: a "Shared with" chip per person/album/link grant, each
// removable.
//
// Design sweep (2026-11): one compact list instead of three stacked views.
// The friend picker opens in place under "Send to a person", the link row
// sends (or creates) the link directly with Copy beside it, and "Link is
// live" is a removable chip like the other grants. The share card previews a
// full-size image, so it is its own screen (app/share-card.tsx), not a view
// in here.

// BottomSheet closes in 220ms and then unmounts its Modal; iOS won't present
// a new screen over a Modal that is still closing, so the card waits this long.
const SHEET_CLOSE_MS = 300;

export function ShareMomentSheet({ visible, moment, photoUrls, onClose, onAddToAlbum }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, profile } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [personOpen, setPersonOpen] = useState(false);

  const isOwner = !!user && moment.userId === user.id;

  const handleClose = useCallback(() => {
    setPersonOpen(false);
    onClose();
  }, [onClose]);

  // The card is a full screen: hand the moment over, close the sheet, then
  // navigate once its Modal is gone.
  const handleOpenCard = () => {
    setShareCardData({ moment, photoUrls });
    handleClose();
    setTimeout(() => router.push("/share-card"), SHEET_CLOSE_MS);
  };

  // ── Link state ────────────────────────────────────────────────────────
  const [shareToken, setShareToken] = useState<string | null>(moment.shareToken ?? null);
  const [sendingLink, setSendingLink] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Grants ("Shared with" chips + person sent-state) ──────────────────
  const [peopleGrants, setPeopleGrants] = useState<MomentShareGrant[]>([]);
  const [albumGrants, setAlbumGrants] = useState<AlbumGrant[]>([]);

  // ── Person picker ─────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const friendsLoadedRef = useRef(false);

  // Per-moment state resets when the sheet is reused for another moment.
  useEffect(() => {
    friendsLoadedRef.current = false;
    setPeopleGrants([]);
    setAlbumGrants([]);
  }, [moment.id]);

  // A card-column preview has no shareToken (MOMENT_CARD_COLUMNS omits it), so
  // trusting the prop could mint a second token over a live one. Re-read the truth from the row every time the sheet opens — and reload the
  // grant chips alongside it (owner only). Every open, not once per moment:
  // "Add to album" and other screens change them between opens.
  useEffect(() => {
    if (!visible) return;
    setShareToken(moment.shareToken ?? null);
    setLinkCopied(false);
    supabase
      .from("moments")
      .select("share_token")
      .eq("id", moment.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setShareToken(data.share_token);
      });

    if (isOwner && user) {
      // A failed load keeps the chips from the last successful one; the
      // chips are state, not the action, so they don't block sharing.
      fetchMomentShareRecipients(moment.id)
        .then(setPeopleGrants)
        .catch((err) => { if (__DEV__) console.warn("[share] recipients load failed:", err); });
      Promise.all([fetchAlbums(user.id), fetchAlbumIdsContainingMoment(moment.id)])
        .then(([cols, memberIds]) => {
          const inAlbum = new Set(memberIds);
          setAlbumGrants(cols.filter((c) => inAlbum.has(c.id)).map((c) => ({ id: c.id, name: c.name })));
        })
        .catch((err) => { if (__DEV__) console.warn("[share] album chips load failed:", err); });
    }
  }, [visible, moment.id, moment.shareToken, isOwner, user]);

  // ── Link handlers ─────────────────────────────────────────────────────
  // Only the owner can create a link; anyone who can see the moment can send
  // one that already exists.
  const canSendLink = !!shareToken || isOwner;

  const handleSendLink = async () => {
    if (sendingLink || !canSendLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingLink(true);
    let token: string;
    try {
      token = await ensureShareToken(moment.id, shareToken);
      setShareToken(token);
    } catch (err) {
      setSendingLink(false);
      Alert.alert("Couldn't create link", friendlyError(err));
      return;
    }
    try {
      const url = momentShareUrl(token);
      await Share.share({ message: url, url });
      handleClose();
    } catch {
      // The share sheet was dismissed or failed to present; the link exists.
    } finally {
      setSendingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(momentShareUrl(shareToken));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleRevokeLink = async () => {
    if (!shareToken || revoking) return;
    const confirmed = await confirmSheet({
      title: "Turn off link?",
      message: "Anyone who has this link will no longer be able to view this moment.",
      confirmLabel: "Turn Off",
      destructive: true,
    });
    if (!confirmed) return;
    setRevoking(true);
    try {
      const { error } = await supabase
        .from("moments")
        .update({ share_token: null })
        .eq("id", moment.id);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShareToken(null);
    } catch (err) {
      Alert.alert("Couldn't turn off link", friendlyError(err));
    } finally {
      setRevoking(false);
    }
  };

  // ── Person handlers ───────────────────────────────────────────────────
  const handleShareFriendLink = async () => {
    if (!profile?.friendInviteToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = friendInviteUrl(profile.friendInviteToken);
    try {
      await Share.share(Platform.OS === "ios" ? { url } : { message: url });
    } catch {
      // User dismissed the share sheet — nothing to report.
    }
  };

  const togglePerson = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const opening = !personOpen;
    setPersonOpen(opening);
    if (!opening || friendsLoadedRef.current || !user) return;
    friendsLoadedRef.current = true;
    setFriendsLoading(true);
    setFriendsError("");
    fetchFriends(user.id)
      .then(setFriends)
      .catch((e) => {
        friendsLoadedRef.current = false;
        setFriendsError(friendlyError(e));
      })
      .finally(() => setFriendsLoading(false));
  };

  const sentIds = new Set(peopleGrants.map((g) => g.recipientId));

  const handleSendToFriend = async (friendship: Friendship) => {
    if (!user) return;
    const recipientId = friendship.otherUserId;
    if (sentIds.has(recipientId) || sendingIds.has(recipientId)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingIds((prev) => new Set(prev).add(recipientId));
    try {
      const result = await sendMomentShare(moment.id, user.id, recipientId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.status === "sent") {
        setPeopleGrants((prev) => [
          ...prev,
          { shareId: result.shareId, recipientId, name: friendship.otherUserDisplayName },
        ]);
      }
      posthog?.capture("moment_share_sent", {
        song_title: moment.songTitle,
        song_artist: moment.songArtist,
      });
    } catch (e) {
      Alert.alert("Couldn't send", friendlyError(e));
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(recipientId);
        return next;
      });
    }
  };

  // ── Chip removal ──────────────────────────────────────────────────────
  const handleRemovePersonGrant = async (grant: MomentShareGrant) => {
    const confirmed = await confirmSheet({
      title: "Unsend?",
      message: `${grant.name ?? "This person"} will no longer see this moment in their Shared with me.`,
      confirmLabel: "Unsend",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeMomentShare(grant.shareId);
      setPeopleGrants((prev) => prev.filter((g) => g.shareId !== grant.shareId));
    } catch (e) {
      Alert.alert("Couldn't unsend", friendlyError(e));
    }
  };

  const handleRemoveAlbumGrant = async (grant: AlbumGrant) => {
    const confirmed = await confirmSheet({
      title: "Remove from album?",
      message: `This moment will leave “${grant.name}”.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeMomentFromAlbum(grant.id, moment.id);
      setAlbumGrants((prev) => prev.filter((g) => g.id !== grant.id));
      invalidateAlbumCaches(queryClient, user?.id, grant.id);
    } catch (e) {
      Alert.alert("Couldn't remove", friendlyError(e));
    }
  };

  const songSubtitle = [moment.songTitle, moment.songArtist].filter(Boolean).join(" · ");

  const hasChips = peopleGrants.length > 0 || albumGrants.length > 0 || !!shareToken;

  const optionRow = ({
    icon,
    title,
    desc,
    onPress,
    trailing,
    loading = false,
    expanded,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
    onPress: () => void;
    trailing?: ReactNode;
    loading?: boolean;
    /** Set for a row that opens in place (chevron down/up, not forward). */
    expanded?: boolean;
  }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
    >
      <View style={styles.rowIcon}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        ) : (
          <Ionicons name={icon} size={22} color={theme.colors.text} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      {trailing ?? (
        <Ionicons
          name={expanded === undefined ? "chevron-forward" : expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.colors.textSecondary}
        />
      )}
    </Pressable>
  );

  const personList = friendsLoading ? (
    <View style={styles.personState}>
      <ActivityIndicator color={theme.colors.textSecondary} />
    </View>
  ) : friendsError ? (
    <View style={styles.personState}>
      <Text style={styles.personStateText}>{friendsError}</Text>
    </View>
  ) : friends.length === 0 ? (
    // An empty picker is the moment someone actually *wants* a friend here —
    // so offer the invite inline instead of describing an errand on another
    // screen.
    <View style={styles.personState}>
      <Text style={styles.personStateText}>
        Nobody here yet. Send someone your link — once they open it you can send
        moments straight to each other.
      </Text>
      <Button
        label="Share your friend link"
        variant="secondary"
        size="pill"
        onPress={handleShareFriendLink}
        style={styles.personInvite}
      />
    </View>
  ) : (
    friends.map((friendship) => {
      const sent = sentIds.has(friendship.otherUserId);
      const sending = sendingIds.has(friendship.otherUserId);
      const initials = (friendship.otherUserDisplayName ?? "?")[0]?.toUpperCase() ?? "?";
      return (
        <Pressable
          key={friendship.id}
          style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
          onPress={() => handleSendToFriend(friendship)}
          disabled={sent || sending}
          accessibilityRole="button"
          accessibilityLabel={`Send to ${friendship.otherUserDisplayName ?? "this friend"}`}
          accessibilityState={{ disabled: sent || sending }}
        >
          <View style={styles.personAvatar}>
            {friendship.otherUserAvatarUrl ? (
              <AppImage
                source={{ uri: getPublicPhotoUrl(friendship.otherUserAvatarUrl) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.personInitial}>{initials}</Text>
            )}
          </View>
          <Text style={styles.personName} numberOfLines={1}>
            {friendship.otherUserDisplayName ?? "Unknown"}
          </Text>
          {sending ? (
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          ) : sent ? (
            <View style={styles.sentState}>
              <Ionicons name="checkmark" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.sentText}>Sent</Text>
            </View>
          ) : (
            <Button
              label="Send"
              variant="secondary"
              size="pill"
              onPress={() => handleSendToFriend(friendship)}
            />
          )}
        </Pressable>
      );
    })
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Share this moment"
    >
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {!!songSubtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {songSubtitle}
          </Text>
        )}

        {/* The three verbs, as rows */}
        <View style={styles.rows}>
          {isOwner && (
            <>
              {optionRow({
                icon: "person-add-outline",
                title: "Send to a person",
                desc: "It lands in their Shared with me",
                onPress: togglePerson,
                expanded: personOpen,
              })}
              {personOpen ? <View style={styles.personList}>{personList}</View> : null}
            </>
          )}
          {onAddToAlbum &&
            optionRow({
              icon: "albums-outline",
              title: "Add to album",
              desc: "Yours, or one you share",
              onPress: () => {
                handleClose();
                onAddToAlbum();
              },
            })}
          {/* Only the owner can create a link, so a viewer of a moment with
              no link doesn't get the row at all. */}
          {canSendLink &&
            optionRow({
              icon: "link-outline",
              title: shareToken ? "Send link" : "Create link",
              desc: "Anyone with it can view this moment",
              onPress: handleSendLink,
              loading: sendingLink,
              trailing:
                shareToken && isOwner ? (
                  <Button
                    variant="text"
                    size="pill"
                    label={linkCopied ? "Copied" : "Copy"}
                    onPress={handleCopyLink}
                    accessibilityLabel="Copy link"
                  />
                ) : undefined,
            })}
          {optionRow({
            icon: "image-outline",
            title: "Share card",
            desc: "A designed image for posts and Stories",
            onPress: handleOpenCard,
          })}
        </View>

        {/* Honest state: one chip per grant, each removable */}
        {isOwner && hasChips && (
          <View style={styles.sharedWith}>
            <SectionLabel>Shared with</SectionLabel>
            <View style={styles.chipsWrap}>
              {peopleGrants.map((g) => (
                <Chip
                  key={g.shareId}
                  variant="filled"
                  icon="person-outline"
                  label={g.name ?? "Someone"}
                  onPress={() => handleRemovePersonGrant(g)}
                  onRemove={() => handleRemovePersonGrant(g)}
                  removeLabel={`Unsend from ${g.name ?? "this person"}`}
                />
              ))}
              {albumGrants.map((g) => (
                <Chip
                  key={g.id}
                  variant="filled"
                  icon="albums-outline"
                  label={g.name}
                  onPress={() => handleRemoveAlbumGrant(g)}
                  onRemove={() => handleRemoveAlbumGrant(g)}
                  removeLabel={`Remove from ${g.name}`}
                />
              ))}
              {!!shareToken && (
                <Chip
                  variant="filled"
                  icon="link-outline"
                  label={revoking ? "Turning off…" : "Link is live"}
                  onPress={handleRevokeLink}
                  onRemove={handleRevokeLink}
                  removeLabel="Turn off link"
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>

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
    subtitle: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    // Rows on the page, ruled by hairlines in the divider token.
    rows: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 64,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    rowIcon: {
      width: 24,
      alignItems: "center",
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    rowDesc: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    // The friend picker, opened in place under its row.
    personList: {
      paddingLeft: 24 + theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
      paddingVertical: theme.spacing.xs,
    },
    personState: {
      paddingVertical: theme.spacing.md,
    },
    personStateText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      color: theme.colors.textSecondary,
    },
    personInvite: {
      marginTop: theme.spacing.md,
    },
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.md,
    },
    personAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: theme.colors.backgroundTertiary,
    },
    personInitial: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    personName: {
      ...theme.typography.body,
      color: theme.colors.text,
      flex: 1,
    },
    sentState: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
    },
    sentText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    sharedWith: {
      marginTop: theme.spacing.xl,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
  });
}
