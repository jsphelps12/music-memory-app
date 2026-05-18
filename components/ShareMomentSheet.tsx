import { useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Share,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { ShareCard, CARD_WIDTH, CARD_HEIGHT } from "@/components/ShareCard";
import { Moment, TaggedMoment } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { CloseButton } from "@/components/CloseButton";

interface Props {
  visible: boolean;
  moment: Moment;
  photoUrls: string[];
  tags: TaggedMoment[];
  onClose: () => void;
}

export function ShareMomentSheet({ visible, moment, photoUrls, tags, onClose }: Props) {
  const theme = useTheme();
  const viewShotRef = useRef<ViewShot>(null);
  const [view, setView] = useState<"options" | "card">("options");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [sentTagIds, setSentTagIds] = useState<Set<string>>(new Set());
  const [sendingTagId, setSendingTagId] = useState<string | null>(null);

  const handleClose = () => {
    setView("options");
    onClose();
  };

  const handleSendLink = async () => {
    if (sendingLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingLink(true);
    try {
      let token = moment.shareToken;
      if (!token) {
        token = Crypto.randomUUID();
        const { error } = await supabase
          .from("moments")
          .update({ share_token: token })
          .eq("id", moment.id);
        if (error) throw error;
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

  const handleSendToFriend = async (tag: TaggedMoment) => {
    if (sendingTagId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingTagId(tag.id);
    try {
      if (!tag.released) {
        const { releaseTag } = await import("@/lib/friends");
        await releaseTag(tag.id);
      } else {
        await supabase.functions.invoke("notify-friend", {
          body: { toUserId: tag.taggedUserId, type: "moment_tagged", payload: { momentId: moment.id } },
        });
      }
      setSentTagIds((prev) => new Set([...prev, tag.id]));
    } catch {
      Alert.alert("Couldn't send", "Please try again.");
    } finally {
      setSendingTagId(null);
    }
  };

  const songSubtitle = [moment.songTitle, moment.songArtist].filter(Boolean).join(" · ");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: theme.colors.backgroundSecondary }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />

          {view === "options" ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.colors.text }]}>Share this moment</Text>
                  {!!songSubtitle && (
                    <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {songSubtitle}
                    </Text>
                  )}
                </View>
                <CloseButton onPress={handleClose} />
              </View>

              {/* Option rows */}
              <View style={[styles.optionCard, { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.border }]}>
                {/* Create share card */}
                <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setView("card")}>
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + "20" }]}>
                    <Ionicons name="sparkles" size={20} color={theme.colors.accent} />
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
                  <View style={[styles.iconBox, { backgroundColor: "#4A90E220" }]}>
                    {sendingLink
                      ? <ActivityIndicator size="small" color="#4A90E2" />
                      : <Ionicons name="link-outline" size={20} color="#4A90E2" />
                    }
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, { color: theme.colors.text }]}>Share link</Text>
                    <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>Send via text, email or anywhere</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>

              {/* Tagged friends — separate card with purple border */}
              {tags.map((tag) => {
                const name = tag.taggerDisplayName ?? "Friend";
                const sent = sentTagIds.has(tag.id);
                const sending = sendingTagId === tag.id;
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[
                      styles.friendCard,
                      {
                        backgroundColor: theme.colors.accentSecondaryBg,
                        borderColor: theme.colors.accentSecondary + "55",
                      },
                    ]}
                    activeOpacity={sent ? 1 : 0.7}
                    onPress={() => !sent && handleSendToFriend(tag)}
                    disabled={sent || !!sendingTagId}
                  >
                    <View style={[styles.iconBox, { backgroundColor: theme.colors.accentSecondary + "25" }]}>
                      {sending
                        ? <ActivityIndicator size="small" color={theme.colors.accentSecondary} />
                        : <Ionicons name="people" size={20} color={theme.colors.accentSecondary} />
                      }
                    </View>
                    <View style={styles.optionText}>
                      <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
                        {sent ? `Sent to ${name}` : `Send to ${name} in app`}
                      </Text>
                      <Text style={[styles.optionDesc, { color: theme.colors.textSecondary }]}>
                        They were part of this memory
                      </Text>
                    </View>
                    {sent
                      ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.accentSecondary} />
                      : <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                    }
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose} activeOpacity={0.7}>
                <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Card view header */}
              <View style={styles.cardHeader}>
                <TouchableOpacity onPress={() => setView("options")} hitSlop={12} activeOpacity={0.7} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Share card</Text>
                <CloseButton onPress={handleClose} />
              </View>

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
                          <Image source={{ uri: item }} style={styles.thumbImage} contentFit="cover" />
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
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
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
    fontWeight: "600",
  },
  optionDesc: {
    fontSize: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
  },
  friendCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    marginBottom: 10,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  // Card view
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 32,
    alignItems: "flex-start",
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
    fontWeight: "600",
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
    fontWeight: "700",
  },
});
