import {
  View,
  Text,
  Modal,
  Switch,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { Collection } from "@/types";
import { setCollectionPublic, leaveCollection } from "@/lib/collections";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { friendlyError } from "@/lib/errors";

const WEB_BASE_URL = "https://music-memory-app.vercel.app";

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
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const isOwner = collection.role === "owner";

  const inviteUrl = collection.inviteCode
    ? `${WEB_BASE_URL}/c/${collection.inviteCode}`
    : null;

  async function handleToggle(value: boolean) {
    setSaving(true);
    setError("");
    try {
      await setCollectionPublic(collection.id, value);
      onUpdated({ ...collection, isPublic: value });
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {collection.name}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isOwner ? (
          <>
            {/* Public toggle — only for owner */}
            <View style={[styles.row, { borderBottomColor: theme.colors.backgroundInput }]}>
              <View style={styles.rowLeft}>
                <Ionicons name="globe-outline" size={20} color={theme.colors.text} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Make Public</Text>
                  <Text style={[styles.rowSub, { color: theme.colors.textSecondary }]}>
                    Anyone with the link can view this collection
                  </Text>
                </View>
              </View>
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Switch
                  value={collection.isPublic ?? false}
                  onValueChange={handleToggle}
                  trackColor={{ true: theme.colors.accent }}
                  thumbColor="#fff"
                />
              )}
            </View>

            {error ? (
              <Text style={[styles.error, { color: theme.colors.destructive ?? "#E53E3E" }]}>
                {error}
              </Text>
            ) : null}

            {/* Share section — only when public */}
            {collection.isPublic && inviteUrl ? (
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
                  <Text style={styles.shareButtonText}>Share Link</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <>
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
          </>
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
    paddingBottom: 40,
    paddingHorizontal: 20,
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
});
