import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Share,
  StyleSheet,
  Platform,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon, type IconName } from "@/components/Icon";
import { usePostHog } from "posthog-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import * as Clipboard from "expo-clipboard";
import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { SectionLabel } from "@/components/SectionLabel";
import { ListRow } from "@/components/ListRow";
import { PersonPicker, pickerHasSearch } from "@/components/PersonPicker";
import { friendsAsPeople, type FriendPerson } from "@/lib/friends";
import { rankPeople } from "@/lib/people";
import { recentRecipientsQueryKey, useFriends, useRecentRecipients } from "@/hooks/useFriends";
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
import { setShareCardData } from "@/lib/shareCardStore";
import { friendlyError } from "@/lib/errors";
import { canPassOn } from "@/lib/momentView";
import { PartialMoment } from "@/types";
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

export function ShareMomentSheet({ visible, moment, photoUrls, onClose, onAddToAlbum }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, profile } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [personOpen, setPersonOpen] = useState(false);
  // "Show all" swaps the sheet's rows for the whole list (with search), so a
  // long friend list never pushes the other verbs and chips out of reach.
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllQuery, setShowAllQuery] = useState("");
  // What to open once the sheet is fully closed. iOS drops a Modal (the album
  // sheet) or a full-screen route (the card) that presents while this sheet's
  // Modal is still dismissing, so they wait for BottomSheet's onClosed.
  const [afterClose, setAfterClose] = useState<"album" | "card" | null>(null);
  // A failed action, shown inline at the top of the sheet (an Alert over an
  // open sheet sits on top of it and reads as a second surface).
  const [error, setError] = useState("");
  const fail = (what: string, err: unknown) => setError(`${what}. ${friendlyError(err)}`);

  // Only the owner can pass a moment on (lib/momentView.ts). The detail
  // screen doesn't offer this sheet to anyone else; this keeps it that way.
  const isOwner = canPassOn(moment, user?.id);

  const handleClose = useCallback(() => {
    setPersonOpen(false);
    setShowAllPeople(false);
    onClose();
  }, [onClose]);

  // The card is a full screen: hand the moment over, close the sheet, then
  // navigate once its Modal is gone.
  const handleOpenCard = () => {
    setShareCardData({ moment, photoUrls });
    setAfterClose("card");
    handleClose();
  };

  const handleAddToAlbum = () => {
    setAfterClose("album");
    handleClose();
  };

  const handleClosed = () => {
    // The picker's order (recent sends first) stays put while the sheet is
    // open, so a row never jumps under a finger; it catches up for next time.
    void queryClient.invalidateQueries({ queryKey: recentRecipientsQueryKey(user?.id) });
    const next = afterClose;
    setAfterClose(null);
    if (next === "album") onAddToAlbum?.();
    else if (next === "card") router.push("/share-card");
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
  // The shared friends cache (hooks/useFriends.ts), warmed as the sheet
  // opens so "Send to a person" expands without a wait. Recent recipients
  // come first, then A–Z.
  const friendsQuery = useFriends({ enabled: visible && isOwner });
  const recentsQuery = useRecentRecipients({ enabled: visible && isOwner });
  const people = useMemo(
    () => rankPeople(friendsAsPeople(friendsQuery.data ?? []), recentsQuery.data),
    [friendsQuery.data, recentsQuery.data]
  );
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  // Per-moment state resets when the sheet is reused for another moment.
  useEffect(() => {
    setPeopleGrants([]);
    setAlbumGrants([]);
    setShowAllPeople(false);
  }, [moment.id]);

  // A card-column preview has no shareToken (MOMENT_CARD_COLUMNS omits it), so
  // trusting the prop could mint a second token over a live one. Re-read the
  // truth from the row every time the sheet opens (owner only), and reload the
  // grant chips alongside it. Every open, not once per moment:
  // "Add to album" and other screens change them between opens.
  useEffect(() => {
    if (!visible) return;
    setShareToken(isOwner ? moment.shareToken ?? null : null);
    setLinkCopied(false);
    setError("");
    // Nobody but the owner ever asks for the link token.
    if (!isOwner || !user) return;
    supabase
      .from("moments")
      .select("share_token")
      .eq("id", moment.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setShareToken(data.share_token);
      });

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
  }, [visible, moment.id, moment.shareToken, isOwner, user]);

  // ── Link handlers ─────────────────────────────────────────────────────
  // Only the owner creates or sends a link.
  const canSendLink = isOwner;

  const handleSendLink = async () => {
    if (sendingLink || !canSendLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingLink(true);
    setError("");
    let token: string;
    try {
      token = await ensureShareToken(moment.id, shareToken);
      setShareToken(token);
    } catch (err) {
      setSendingLink(false);
      fail("Couldn't create link", err);
      return;
    }
    try {
      const url = momentShareUrl(token);
      // One or the other: iOS sends both when given both, so the link
      // arrived twice in Messages.
      await Share.share(Platform.OS === "ios" ? { url } : { message: url });
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
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!confirmed) return;
    setRevoking(true);
    setError("");
    try {
      const { error } = await supabase
        .from("moments")
        .update({ share_token: null })
        .eq("id", moment.id);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShareToken(null);
    } catch (err) {
      fail("Couldn't turn off link", err);
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
    // A failed load retries when the row is opened again.
    if (opening && friendsQuery.isError) void friendsQuery.refetch();
  };

  const openAllPeople = (query: string) => {
    setShowAllQuery(query);
    setShowAllPeople(true);
  };

  const sentIds = new Set(peopleGrants.map((g) => g.recipientId));

  const handleSendToFriend = async (person: FriendPerson) => {
    if (!user) return;
    const recipientId = person.id;
    if (sentIds.has(recipientId) || sendingIds.has(recipientId)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingIds((prev) => new Set(prev).add(recipientId));
    setError("");
    try {
      const result = await sendMomentShare(moment.id, user.id, recipientId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.status === "sent") {
        setPeopleGrants((prev) => [
          ...prev,
          { shareId: result.shareId, recipientId, name: person.displayName },
        ]);
      }
      posthog?.capture("moment_share_sent", {
        song_title: moment.songTitle,
        song_artist: moment.songArtist,
      });
    } catch (e) {
      fail("Couldn't send", e);
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
      message: `${grant.name ?? "This person"} will no longer see this moment in their Shared with you.`,
      confirmLabel: "Unsend",
      destructive: true,
    });
    if (!confirmed) return;
    setError("");
    try {
      await removeMomentShare(grant.shareId);
      setPeopleGrants((prev) => prev.filter((g) => g.shareId !== grant.shareId));
    } catch (e) {
      fail("Couldn't unsend", e);
    }
  };

  const handleRemoveAlbumGrant = async (grant: AlbumGrant) => {
    const confirmed = await confirmSheet({
      title: "Remove from album?",
      message: "It stays in your journal.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setError("");
    try {
      await removeMomentFromAlbum(grant.id, moment.id);
      setAlbumGrants((prev) => prev.filter((g) => g.id !== grant.id));
      invalidateAlbumCaches(queryClient, user?.id, grant.id);
    } catch (e) {
      fail("Couldn't remove", e);
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
    icon: IconName;
    title: string;
    desc: string;
    onPress: () => void;
    trailing?: ReactNode;
    loading?: boolean;
    /** Set for a row that opens in place (chevron down/up, not forward). */
    expanded?: boolean;
  }) => (
    <ListRow
      label={title}
      subtitle={desc}
      leading={
        <View style={styles.rowIcon}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          ) : (
            <Icon name={icon} size={22} color={theme.colors.text} />
          )}
        </View>
      }
      accessory={expanded === undefined ? "chevron" : "expand"}
      expanded={expanded}
      trailing={trailing}
      onPress={onPress}
      disabled={loading}
      style={styles.row}
    />
  );

  const sendTrailing = (person: FriendPerson) => {
    if (sendingIds.has(person.id)) {
      return <ActivityIndicator size="small" color={theme.colors.textSecondary} />;
    }
    if (sentIds.has(person.id)) {
      return (
        <View style={styles.sentState}>
          <Icon name="checkmark" size={16} color={theme.colors.text} />
          <Text style={styles.sentText}>Sent</Text>
        </View>
      );
    }
    return (
      <Button
        label="Send"
        variant="secondary"
        size="pill"
        align="center"
        onPress={() => handleSendToFriend(person)}
        accessibilityLabel={`Send to ${person.displayName ?? "this person"}`}
      />
    );
  };

  // An empty picker is the moment someone actually *wants* a friend here —
  // so offer the invite inline instead of describing an errand on another
  // screen.
  const personEmpty = (
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
  );

  // Sending is one tap per person. A sent (or sending) row isn't a button
  // any more: no onPress, so ListRow renders it as plain content.
  const pickerProps = {
    people,
    loading: friendsQuery.isLoading,
    error: friendsQuery.isError ? friendlyError(friendsQuery.error) : undefined,
    onRetry: () => void friendsQuery.refetch(),
    emptyState: personEmpty,
    renderTrailing: sendTrailing,
    rowAccessibilityLabel: (p: FriendPerson) =>
      `${sentIds.has(p.id) ? "Sent to" : "Send to"} ${p.displayName ?? p.username ?? "this person"}`,
    searchPlaceholder: "Search friends",
    canPick: (p: FriendPerson) => !sentIds.has(p.id) && !sendingIds.has(p.id),
  };
  const pickerOnPick = (p: FriendPerson) => void handleSendToFriend(p);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      onClosed={handleClosed}
      title={showAllPeople ? "Send to a person" : "Share this moment"}
      keyboardAvoiding
      // Steady height while searching the whole list.
      minHeight={showAllPeople && pickerHasSearch(people.length) ? "75%" : undefined}
    >
      {showAllPeople ? (
        <View style={styles.allPeople}>
          <Button
            variant="text"
            size="pill"
            tone="secondary"
            icon="chevron-back"
            label="Back"
            onPress={() => setShowAllPeople(false)}
            accessibilityLabel="Back to sharing options"
            style={styles.back}
          />
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <PersonPicker
            mode="list"
            {...pickerProps}
            onPick={pickerOnPick}
            initialQuery={showAllQuery}
          />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {!!songSubtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {songSubtitle}
          </Text>
        )}

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {/* The three verbs, as rows */}
        <View style={styles.rows}>
          {isOwner && (
            <>
              {optionRow({
                icon: "person-add-outline",
                title: "Send to a person",
                desc: "It lands in their Shared with you",
                onPress: togglePerson,
                expanded: personOpen,
              })}
              {personOpen ? (
                <View style={styles.personList}>
                  <PersonPicker
                    mode="inline"
                    {...pickerProps}
                    onPick={pickerOnPick}
                    onShowAll={openAllPeople}
                    testID="share-person-picker"
                  />
                </View>
              ) : null}
            </>
          )}
          {isOwner && onAddToAlbum &&
            optionRow({
              icon: "albums-outline",
              title: "Add to album",
              desc: "Yours, or one you share",
              onPress: handleAddToAlbum,
            })}
          {/* Link and card are the owner's to send. */}
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
                    align="center"
                    onPress={handleCopyLink}
                    accessibilityLabel="Copy link"
                  />
                ) : undefined,
            })}
          {isOwner &&
            optionRow({
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
    subtitle: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
      marginBottom: theme.spacing.md,
    },
    // Rows on the page, ruled by hairlines in the divider token.
    rows: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      minHeight: 64,
    },
    rowIcon: {
      width: 24,
      alignItems: "center",
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
    // The whole list, in place of the sheet's rows.
    allPeople: {
      flexShrink: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    back: {
      alignSelf: "flex-start",
      marginLeft: -theme.spacing.sm,
      marginBottom: theme.spacing.xs,
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
