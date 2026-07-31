import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { AppImage } from "@/components/AppImage";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { friendlyError } from "@/lib/errors";
import { createAlbum, updateAlbumCover } from "@/lib/albums";
import { uploadAlbumCover } from "@/lib/storage";
import type { Album } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  /**
   * When provided, the new album is handed back (picker flow — e.g. selecting
   * an album for the moment being created). When omitted, the sheet navigates
   * to the album screen after creation (Albums-tab flow).
   */
  onCreated?: (album: Album) => void;
  /** Initial state of the Personal/Shared toggle. Defaults to shared. */
  defaultShared?: boolean;
}

/**
 * The single "New Album" sheet. Replaces the two parallel implementations
 * (CreateAlbumModal / NewSharedAlbumModal) that had drifted apart — this is
 * NewSharedAlbumModal's feature set (cover photo, personal/shared toggle) on
 * the shared BottomSheet, with CreateAlbumModal's hand-back-the-album flow
 * available via onCreated.
 */
export function CreateAlbumSheet({ visible, onClose, userId, onCreated, defaultShared = true }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(defaultShared);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    setName("");
    setIsShared(defaultShared);
    setCoverUri(null);
    onClose();
  }, [onClose, defaultShared]);

  const handlePickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      const album = await createAlbum(userId, trimmed, isShared);
      if (coverUri) {
        const path = await uploadAlbumCover(userId, album.id, coverUri);
        await updateAlbumCover(album.id, path);
      }
      await queryClient.invalidateQueries({ queryKey: ["collectionsScreen", userId] });
      handleClose();
      if (onCreated) {
        onCreated(album);
      } else {
        router.push({ pathname: "/album/[id]" as any, params: { id: album.id } });
      }
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="New Album" keyboardAvoiding>
      <View style={styles.content}>
        {/* Cover photo picker */}
        <TouchableOpacity onPress={handlePickCover} style={styles.coverPicker} activeOpacity={0.8}>
          {coverUri ? (
            <AppImage source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={theme.colors.textTertiary} />
              <Text style={styles.coverPlaceholderText}>Add Cover Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Personal / Shared toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typePill, !isShared && { backgroundColor: theme.colors.buttonBg }]}
            onPress={() => setIsShared(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.typePillText, { color: !isShared ? theme.colors.buttonText : theme.colors.textSecondary }]}>
              Personal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typePill, isShared && { backgroundColor: theme.colors.buttonBg }]}
            onPress={() => setIsShared(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.typePillText, { color: isShared ? theme.colors.buttonText : theme.colors.textSecondary }]}>
              Shared
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Name</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Road Trip Mix"
            placeholderTextColor={theme.colors.placeholder}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.createBtn,
            { backgroundColor: name.trim() ? theme.colors.accent : theme.colors.border },
          ]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </TouchableOpacity>
        {isShared && (
          <Text style={styles.hint}>You'll be taken to the album to invite members.</Text>
        )}
      </View>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.xl,
    },
    coverPicker: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.md,
      overflow: "hidden",
      marginBottom: theme.spacing.lg,
      backgroundColor: theme.colors.backgroundTertiary,
    },
    coverPlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    coverPlaceholderText: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textTertiary,
    },
    typeToggle: {
      flexDirection: "row",
      borderRadius: theme.radii.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundTertiary,
      padding: 3,
      marginBottom: theme.spacing.xl,
    },
    typePill: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: theme.radii.full,
      alignItems: "center",
    },
    typePillText: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.bodySemibold,
    },
    label: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
      marginBottom: 6,
    },
    inputRow: {
      borderRadius: theme.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundInput,
      paddingHorizontal: 14,
      height: 48,
      justifyContent: "center",
      marginBottom: theme.spacing.lg,
    },
    input: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    createBtn: {
      height: 50,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.md,
    },
    createBtnText: {
      color: "#fff",
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    hint: {
      fontSize: theme.fontSize.xs,
      textAlign: "center",
      color: theme.colors.textTertiary,
    },
  });
}
