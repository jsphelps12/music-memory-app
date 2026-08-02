import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Share,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { AppImage } from "@/components/AppImage";
import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import {
  ShareCard,
  ShareCardVariant,
  CARD_WIDTH,
  CARD_HEIGHT_POST,
  CARD_HEIGHT_STORY,
} from "@/components/ShareCard";
import { fetchFriends } from "@/lib/friends";
import {
  fetchMomentShareRecipients,
  MomentShareGrant,
  removeMomentShare,
  sendMomentShare,
} from "@/lib/momentShares";
import { fetchAlbums, removeMomentFromAlbum } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { Friendship, Moment } from "@/types";
import { useTheme } from "@/hooks/useTheme";
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
  moment: Moment;
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
// removable. The share card export lives inside the link flow.
export function ShareMomentSheet({ visible, moment, photoUrls, onClose, onAddToAlbum }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const viewShotRef = useRef<ViewShot>(null);
  const [view, setView] = useState<"options" | "person" | "link" | "card">("options");

  const isOwner = !!user && moment.userId === user.id;

  const handleClose = useCallback(() => {
    setView("options");
    onClose();
  }, [onClose]);

  const goTo = (next: "options" | "person" | "link" | "card") => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setView(next);
  };

  // ── Link state ────────────────────────────────────────────────────────
  const [shareToken, setShareToken] = useState<string | null>(moment.shareToken ?? null);
  const [sendingLink, setSendingLink] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Grants ("Shared with" chips + person sent-state) ──────────────────
  const [peopleGrants, setPeopleGrants] = useState<MomentShareGrant[]>([]);
  const [albumGrants, setAlbumGrants] = useState<AlbumGrant[]>([]);
  const grantsLoadedRef = useRef(false);

  // ── Person picker ─────────────────────────────────────────────────────
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const friendsLoadedRef = useRef(false);

  // ── Card export ───────────────────────────────────────────────────────
  const [cardVariant, setCardVariant] = useState<ShareCardVariant>("post");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  // Per-moment state resets when the sheet is reused for another moment.
  useEffect(() => {
    grantsLoadedRef.current = false;
    friendsLoadedRef.current = false;
    setPeopleGrants([]);
    setAlbumGrants([]);
  }, [moment.id]);

  // Card-column-shaped moments always carry shareToken: null (MOMENT_CARD_COLUMNS
  // omits it), so trusting the prop could mint a second token over a live one.
  // Re-read the truth from the row every time the sheet opens — and load the
  // grant chips alongside it (owner only; sheet-open is the signal).
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

    if (isOwner && user && !grantsLoadedRef.current) {
      grantsLoadedRef.current = true;
      fetchMomentShareRecipients(moment.id)
        .then(setPeopleGrants)
        .catch(() => {
          grantsLoadedRef.current = false;
        });
      fetchAlbums(user.id)
        .then((cols) =>
          setAlbumGrants(
            cols
              .filter((c) => c.momentIds?.includes(moment.id))
              .map((c) => ({ id: c.id, name: c.name }))
          )
        )
        .catch(() => {});
    }
  }, [visible, moment.id, moment.shareToken, isOwner, user]);

  // ── Link handlers ─────────────────────────────────────────────────────
  const mintToken = async (): Promise<string> => {
    let token = shareToken;
    if (!token) {
      token = Crypto.randomUUID();
      const { error } = await supabase
        .from("moments")
        .update({ share_token: token })
        .eq("id", moment.id);
      if (error) throw error;
      setShareToken(token);
    }
    return token;
  };

  const handleSendLink = async () => {
    if (sendingLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingLink(true);
    try {
      const token = await mintToken();
      const url = `https://soundtracks.app/m/${token}`;
      await Share.share({ message: url, url });
      handleClose();
    } catch (err: any) {
      if (err?.code !== "ECANCELLED" && err?.message !== "Share action cancelled") {
        Alert.alert("Couldn't create link", "Please try again.");
      }
    } finally {
      setSendingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(`https://soundtracks.app/m/${shareToken}`);
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
    } catch {
      Alert.alert("Couldn't turn off link", "Please try again.");
    } finally {
      setRevoking(false);
    }
  };

  // ── Person handlers ───────────────────────────────────────────────────
  const openPersonView = () => {
    goTo("person");
    if (friendsLoadedRef.current || !user) return;
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

  // ── Card export ───────────────────────────────────────────────────────
  const handleShareCard = async () => {
    if (sharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      const uri = await (viewShotRef.current as any).capture({
        format: "png",
        quality: 1.0,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Moment",
        UTI: "public.png",
      });
    } catch {
      // User cancelled or capture failed — silent
    } finally {
      setSharing(false);
    }
  };

  const songSubtitle = [moment.songTitle, moment.songArtist].filter(Boolean).join(" · ");
  const cardHeight = cardVariant === "story" ? CARD_HEIGHT_STORY : CARD_HEIGHT_POST;

  const sheetTitle =
    view === "options"
      ? "Share this moment"
      : view === "person"
        ? "Send to a person"
        : view === "link"
          ? "Share a link"
          : "Share card";

  const hasChips = peopleGrants.length > 0 || albumGrants.length > 0 || !!shareToken;

  const renderBack = (to: "options" | "link") => (
    <TouchableOpacity onPress={() => goTo(to)} hitSlop={12} activeOpacity={0.7} style={styles.backButton}>
      <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
    </TouchableOpacity>
  );

  const optionRow = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    desc: string,
    onPress: () => void
  ) => (
    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
        <Ionicons name={icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );

  const divider = <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={sheetTitle}
      keyboardAvoiding
      maxHeight="92%"
    >
      {view === "options" ? (
        <>
          {!!songSubtitle && (
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {songSubtitle}
            </Text>
          )}

          {/* The three verbs */}
          <View style={[styles.optionCard, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
            {isOwner && (
              <>
                {optionRow("person-add-outline", "Send to a person", "It lands in their Shared with me", openPersonView)}
                {divider}
              </>
            )}
            {onAddToAlbum && (
              <>
                {optionRow("albums-outline", "Add to album", "Yours, or one you share", () => {
                  handleClose();
                  onAddToAlbum();
                })}
                {divider}
              </>
            )}
            {optionRow("link-outline", "Share a link", "Anyone with it can view — card export too", () => goTo("link"))}
          </View>

          {/* Honest state: one chip per grant, each removable */}
          {isOwner && hasChips && (
            <View style={styles.sharedWithSection}>
              <Text style={[styles.sharedWithLabel, { color: theme.colors.textTertiary }]}>
                SHARED WITH
              </Text>
              <View style={styles.chipsWrap}>
                {peopleGrants.map((g) => (
                  <TouchableOpacity
                    key={g.shareId}
                    style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => handleRemovePersonGrant(g)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="person" size={11} color={theme.colors.textSecondary} />
                    <Text style={[styles.chipText, { color: theme.colors.text }]} numberOfLines={1}>
                      {g.name ?? "Someone"}
                    </Text>
                    <Ionicons name="close" size={13} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))}
                {albumGrants.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => handleRemoveAlbumGrant(g)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="albums-outline" size={11} color={theme.colors.textSecondary} />
                    <Text style={[styles.chipText, { color: theme.colors.text }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Ionicons name="close" size={13} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))}
                {!!shareToken && (
                  <TouchableOpacity
                    style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}
                    onPress={handleRevokeLink}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="link" size={11} color={theme.colors.success} />
                    <Text style={[styles.chipText, { color: theme.colors.text }]}>Link is live</Text>
                    <Ionicons name="close" size={13} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={handleClose} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : view === "person" ? (
        <>
          {renderBack("options")}
          {friendsLoading ? (
            <View style={styles.personLoading}>
              <ActivityIndicator color={theme.colors.textSecondary} />
            </View>
          ) : friendsError ? (
            <View style={styles.personEmpty}>
              <Text style={[styles.personEmptyText, { color: theme.colors.textSecondary }]}>{friendsError}</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.personEmpty}>
              <Text style={[styles.personEmptyText, { color: theme.colors.textSecondary }]}>
                No people yet. Share your friend link from your profile to connect — then you can send moments here.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.personList}
              contentContainerStyle={styles.personListContent}
              showsVerticalScrollIndicator={false}
            >
              {friends.map((friendship) => {
                const sent = sentIds.has(friendship.otherUserId);
                const sending = sendingIds.has(friendship.otherUserId);
                const initials = (friendship.otherUserDisplayName ?? "?")[0]?.toUpperCase() ?? "?";
                return (
                  <TouchableOpacity
                    key={friendship.id}
                    style={styles.personRow}
                    activeOpacity={0.7}
                    onPress={() => handleSendToFriend(friendship)}
                    disabled={sent || sending}
                  >
                    <View style={[styles.personAvatar, { backgroundColor: theme.colors.backgroundTertiary }]}>
                      {friendship.otherUserAvatarUrl ? (
                        <AppImage
                          source={{ uri: getPublicPhotoUrl(friendship.otherUserAvatarUrl) }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={[styles.personInitial, { color: theme.colors.textTertiary }]}>{initials}</Text>
                      )}
                    </View>
                    <Text style={[styles.personName, { color: theme.colors.text }]} numberOfLines={1}>
                      {friendship.otherUserDisplayName ?? "Unknown"}
                    </Text>
                    {sending ? (
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    ) : sent ? (
                      <View style={styles.sentState}>
                        <Ionicons name="checkmark" size={16} color={theme.colors.success} />
                        <Text style={[styles.sentText, { color: theme.colors.success }]}>Sent</Text>
                      </View>
                    ) : (
                      <View style={[styles.sendButton, { backgroundColor: theme.colors.buttonBg }]}>
                        <Text style={[styles.sendButtonText, { color: theme.colors.buttonText }]}>Send</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </>
      ) : view === "link" ? (
        <>
          {renderBack("options")}
          <View style={[styles.optionCard, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
            {/* Send / create the link */}
            <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={handleSendLink} disabled={sendingLink}>
              <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
                {sendingLink
                  ? <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                  : <Ionicons name="paper-plane-outline" size={20} color={theme.colors.accent} />
                }
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
                  {shareToken ? "Send link" : "Create link"}
                </Text>
                <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>
                  Send via text, email or anywhere
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>

            {/* Honest link state — owner can copy or turn it off */}
            {!!shareToken && isOwner && (
              <>
                {divider}
                <View style={styles.optionRow}>
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.success + "20" }]}>
                    <Ionicons name="radio-button-on" size={20} color={theme.colors.success} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Link is live</Text>
                    <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>
                      Anyone with the link can view this moment
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleCopyLink} hitSlop={8} activeOpacity={0.7} style={styles.linkAction}>
                    {linkCopied
                      ? <Ionicons name="checkmark" size={18} color={theme.colors.success} />
                      : <Ionicons name="copy-outline" size={18} color={theme.colors.textSecondary} />
                    }
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRevokeLink} hitSlop={8} activeOpacity={0.7} style={styles.linkAction} disabled={revoking}>
                    {revoking
                      ? <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                      : <Ionicons name="close-circle-outline" size={18} color={theme.colors.destructive} />
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

            {divider}

            {/* Card export lives here (spec: "card export lives here too") */}
            {optionRow("sparkles-outline", "Create share card", "A designed image for posts and Stories", () => goTo("card"))}
          </View>
        </>
      ) : (
        <>
          {renderBack("link")}

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.cardScrollContent}>
            {/* Post / Story format toggle — same card, two prints */}
            <View style={styles.variantToggle}>
              {(["post", "story"] as const).map((v) => {
                const active = cardVariant === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.variantPill,
                      { borderColor: theme.colors.border },
                      active && { backgroundColor: theme.colors.buttonBg, borderColor: theme.colors.buttonBg },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setCardVariant(v);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.variantText,
                        { color: active ? theme.colors.buttonText : theme.colors.textSecondary },
                      ]}
                    >
                      {v === "post" ? "Post" : "Story"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Card preview */}
            <View style={styles.cardWrapper}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: "png", quality: 1.0 }}
                style={{ width: CARD_WIDTH, height: cardHeight }}
              >
                <ShareCard
                  moment={moment}
                  photoUrl={photoUrls.length > 0 ? photoUrls[selectedIndex] : null}
                  variant={cardVariant}
                />
              </ViewShot>
            </View>

            {/* Photo picker */}
            {photoUrls.length > 1 && (
              <View style={styles.pickerSection}>
                <Text style={[styles.pickerLabel, { color: theme.colors.textTertiary }]}>Choose photo</Text>
                <FlatList
                  data={photoUrls}
                  horizontal
                  keyExtractor={(_, i) => String(i)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pickerContent}
                  renderItem={({ item, index }) => {
                    const selected = index === selectedIndex;
                    return (
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setSelectedIndex(index); }}
                        activeOpacity={0.8}
                        style={[styles.thumb, selected && { borderColor: theme.colors.accent, borderWidth: 2.5 }]}
                      >
                        <AppImage source={{ uri: item }} style={styles.thumbImage} contentFit="cover" />
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}

            {/* Share button */}
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: theme.colors.buttonBg, opacity: sharing ? 0.7 : 1 }]}
              onPress={handleShareCard}
              activeOpacity={0.8}
              disabled={sharing}
            >
              {sharing
                ? <ActivityIndicator color={theme.colors.buttonText} />
                : <Text style={[styles.shareButtonText, { color: theme.colors.buttonText }]}>Share image</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </>
      )}
      {/* Local confirm host: a root-level Modal can't present over this open
          sheet (iOS silently drops it), so confirms asked from in here need a
          host nested inside the sheet's own Modal hierarchy. */}
      <ConfirmSheetHost />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  optionCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  linkAction: {
    padding: 6,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
  optionDesc: {
    fontSize: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
  },
  sharedWithSection: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sharedWithLabel: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: 200,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    flexShrink: 1,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  // Person picker
  personLoading: {
    paddingVertical: 40,
    alignItems: "center",
  },
  personEmpty: {
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  personEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  personList: {
    maxHeight: 380,
  },
  personListContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  personAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  personInitial: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
  personName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
  },
  sendButtonText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  sentState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  sentText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  // Card view
  cardScrollContent: {
    paddingBottom: 8,
  },
  variantToggle: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  variantPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  variantText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  cardWrapper: {
    alignSelf: "center",
    marginVertical: 12,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  pickerSection: {
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pickerContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  shareButton: {
    marginHorizontal: 20,
    maxWidth: CARD_WIDTH,
    alignSelf: "center",
    width: "100%",
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
  },
});
