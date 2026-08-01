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
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { AppImage } from "@/components/AppImage";
import { BottomSheet } from "@/components/BottomSheet";
import { ShareCard, CARD_WIDTH, CARD_HEIGHT } from "@/components/ShareCard";
import { fetchFriends } from "@/lib/friends";
import { fetchSentRecipientIds, sendMomentShare } from "@/lib/momentShares";
import { getPublicPhotoUrl } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { Friendship, Moment } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  visible: boolean;
  moment: Moment;
  photoUrls: string[];
  onClose: () => void;
}

export function ShareMomentSheet({ visible, moment, photoUrls, onClose }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const posthog = usePostHog();
  const viewShotRef = useRef<ViewShot>(null);
  const [view, setView] = useState<"options" | "card" | "person">("options");

  const handleClose = useCallback(() => {
    setView("options");
    onClose();
  }, [onClose]);

  const goToCard = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setView("card"); };
  const goToOptions = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setView("options"); };

  // "Send to a person" (Sharing v2 Phase C): recipients are your People; a tap
  // inserts the moment_shares grant and fires the share_received push.
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const personLoadedRef = useRef(false);

  // Sent-state is per moment; a sheet reused for another moment must reload.
  useEffect(() => {
    personLoadedRef.current = false;
  }, [moment.id]);

  const goToPerson = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setView("person");
    if (personLoadedRef.current || !user) return;
    personLoadedRef.current = true;
    setFriendsLoading(true);
    setFriendsError("");
    Promise.all([fetchFriends(user.id), fetchSentRecipientIds(moment.id)])
      .then(([friendList, sent]) => {
        setFriends(friendList);
        setSentIds(sent);
      })
      .catch((e) => {
        personLoadedRef.current = false;
        setFriendsError(friendlyError(e));
      })
      .finally(() => setFriendsLoading(false));
  };

  const handleSendToFriend = async (friendship: Friendship) => {
    if (!user) return;
    const recipientId = friendship.otherUserId;
    if (sentIds.has(recipientId) || sendingIds.has(recipientId)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingIds((prev) => new Set(prev).add(recipientId));
    try {
      await sendMomentShare(moment.id, user.id, recipientId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSentIds((prev) => new Set(prev).add(recipientId));
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(moment.shareToken ?? null);
  const [revoking, setRevoking] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Card-column-shaped moments always carry shareToken: null (MOMENT_CARD_COLUMNS
  // omits it), so trusting the prop could mint a second token over a live one.
  // Re-read the truth from the row every time the sheet opens.
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
  }, [visible, moment.id, moment.shareToken]);

  const handleSendLink = async () => {
    if (sendingLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingLink(true);
    try {
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

  const handleRevokeLink = () => {
    if (!shareToken || revoking) return;
    Alert.alert(
      "Turn off link?",
      "Anyone who has this link will no longer be able to view this moment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn Off",
          style: "destructive",
          onPress: async () => {
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
          },
        },
      ]
    );
  };

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

  const sheetTitle =
    view === "options" ? "Share this moment" : view === "person" ? "Send to a person" : "Share card";

  const isOwner = !!user && moment.userId === user.id;

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

          {/* Option rows */}
          <View style={[styles.optionCard, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
            {/* Send to a person — owner only (the RLS insert policy requires
                moment ownership, so showing it to viewers would only fail) */}
            {isOwner && (
              <>
                <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={goToPerson}>
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
                    <Ionicons name="person-add-outline" size={20} color={theme.colors.accent} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Send to a person</Text>
                    <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>
                      It lands in their Shared with me
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              </>
            )}

            {/* Create share card */}
            <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={goToCard}>
              <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
                <Ionicons name="sparkles-outline" size={20} color={theme.colors.accent} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Create share card</Text>
                <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>A designed image for Stories</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

            {/* Share link */}
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.7}
              onPress={handleSendLink}
              disabled={sendingLink}
            >
              <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
                {sendingLink
                  ? <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                  : <Ionicons name="link-outline" size={20} color={theme.colors.accent} />
                }
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Share link</Text>
                <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>Send via text, email or anywhere</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>

            {/* Link state — the honest row. A live token means anyone with the
                URL can view this moment, whatever the owner assumes. */}
            {!!shareToken && user && moment.userId === user.id && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
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
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={handleClose} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : view === "person" ? (
        <>
          <TouchableOpacity onPress={goToOptions} hitSlop={12} activeOpacity={0.7} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>

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
      ) : (
        <>
          {/* Back to options — header title/close live in the shared BottomSheet header */}
          <TouchableOpacity onPress={goToOptions} hitSlop={12} activeOpacity={0.7} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>

          {/* Scrollable: card preview + photo picker + share button */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.cardScrollContent}
          >
            {/* Card preview */}
            <View style={styles.cardWrapper}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: "png", quality: 1.0 }}
                style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
              >
                <ShareCard moment={moment} photoUrl={photoUrls.length > 0 ? photoUrls[selectedIndex] : null} />
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
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  // Card view
  cardScrollContent: {
    paddingBottom: 8,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 4,
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
});
