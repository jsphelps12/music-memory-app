import { useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ShareCard, CARD_WIDTH, CARD_HEIGHT } from "@/components/ShareCard";
import { Moment } from "@/types";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  visible: boolean;
  moment: Moment;
  photoUrls: string[];  // resolved public URLs
  onClose: () => void;
}

export function ShareCardModal({ visible, moment, photoUrls, onClose }: Props) {
  const theme = useTheme();
  const viewShotRef = useRef<ViewShot>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  const selectedPhotoUrl = photoUrls.length > 0 ? photoUrls[selectedIndex] : null;

  const handleShare = async () => {
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
      // User cancelled share or capture failed — silent
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { backgroundColor: theme.colors.backgroundSecondary }]}>
          {/* Handle + header */}
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Share Moment</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.closeText, { color: theme.colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Card preview */}
          <View style={styles.cardWrapper}>
            <ViewShot
              ref={viewShotRef}
              options={{ format: "png", quality: 1.0 }}
              style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            >
              <ShareCard moment={moment} photoUrl={selectedPhotoUrl} />
            </ViewShot>
          </View>

          {/* Photo picker — only shown when there are multiple photos */}
          {photoUrls.length > 1 && (
            <View style={styles.pickerSection}>
              <Text style={[styles.pickerLabel, { color: theme.colors.textTertiary }]}>
                Choose photo
              </Text>
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
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedIndex(index);
                      }}
                      activeOpacity={0.8}
                      style={[
                        styles.thumb,
                        selected && { borderColor: theme.colors.accent, borderWidth: 2.5 },
                      ]}
                    >
                      <Image
                        source={{ uri: item }}
                        style={styles.thumbImage}
                        contentFit="cover"
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* Share button */}
          <TouchableOpacity
            style={[
              styles.shareButton,
              { backgroundColor: theme.colors.buttonBg, opacity: sharing ? 0.7 : 1 },
            ]}
            onPress={handleShare}
            activeOpacity={0.8}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color={theme.colors.buttonText} />
            ) : (
              <Text style={[styles.shareButtonText, { color: theme.colors.buttonText }]}>
                Share Image
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  closeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cardWrapper: {
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  pickerSection: {
    width: "100%",
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  pickerContent: {
    paddingHorizontal: 24,
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
    width: "100%",
    marginHorizontal: 24,
    maxWidth: CARD_WIDTH,
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
