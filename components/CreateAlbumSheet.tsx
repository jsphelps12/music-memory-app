import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { AppImage } from "@/components/AppImage";
import * as ImagePicker from "expo-image-picker";
import { Icon } from "@/components/Icon";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { TextField } from "@/components/TextField";
import { friendlyError } from "@/lib/errors";
import { albumCoverKey, createAlbum, ensureAlbumGuestUser, updateAlbumCover } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { uploadAlbumCover } from "@/lib/storage";
import type { Album } from "@/types";

const COVER_SIZE = 88;

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
    let album: Album;
    try {
      album = await createAlbum(userId, trimmed, isShared);
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
      setLoading(false);
      return;
    }

    // The album exists from here on. Everything after is best-effort: failing
    // it must not leave the sheet open, or tapping Create again makes a
    // second album with the same name.
    const [guestResult, coverResult] = await Promise.allSettled([
      // Shared albums need a guest user for guest contributions. If this
      // fails, AlbumShareSheet sets it up the next time the owner opens it.
      isShared ? ensureAlbumGuestUser(album.id) : Promise.resolve(),
      coverUri
        ? (async () => {
            const path = await uploadAlbumCover(userId, albumCoverKey(album.id), coverUri);
            await updateAlbumCover(album.id, path);
            return path;
          })()
        : Promise.resolve(undefined),
    ]);
    if (guestResult.status === "rejected" && __DEV__) {
      console.warn("[albums] guest user setup failed:", guestResult.reason);
    }
    if (coverResult.status === "fulfilled" && coverResult.value) {
      album = { ...album, coverPhotoUrl: coverResult.value };
    }

    invalidateAlbumCaches(queryClient, userId);
    setLoading(false);
    handleClose();
    if (coverResult.status === "rejected") {
      Alert.alert(
        "Album created",
        `The cover photo didn't upload (${friendlyError(coverResult.reason)}). You can add it from the album's settings.`
      );
    }
    if (onCreated) {
      onCreated(album);
    } else {
      router.push({ pathname: "/album/[id]" as any, params: { id: album.id } });
    }
  };

  const canCreate = !!name.trim() && !loading;

  // Compact by design (design sweep, 2026-11): a small cover tile beside the
  // name, so the field and Create both stay above the keyboard. The keyboard
  // opens when the name is tapped, not on present, so the sheet rises first.
  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="New album"
      headerAction="none"
      keyboardAvoiding
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Pressable
            onPress={handlePickCover}
            style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={coverUri ? "Change cover photo" : "Add a cover photo"}
          >
            {coverUri ? (
              <AppImage source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <>
                <Icon name="image-outline" size={24} color={theme.colors.textSecondary} />
                <Text style={styles.coverLabel}>Cover</Text>
              </>
            )}
          </Pressable>
          <View style={styles.nameCol}>
            <TextField
              placeholder="Album name"
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              maxLength={60}
              accessibilityLabel="Album name"
            />
          </View>
        </View>

        <View style={styles.choiceRow}>
          <Chip
            label="Personal"
            icon="lock-closed-outline"
            selected={!isShared}
            onPress={() => setIsShared(false)}
          />
          <Chip
            label="Shared"
            icon="people-outline"
            selected={isShared}
            onPress={() => setIsShared(true)}
          />
        </View>
        <Text style={styles.hint}>
          {isShared
            ? "People you invite can add their own moments."
            : "Only you can see it."}
        </Text>

        <Button
          label="Create"
          onPress={handleCreate}
          disabled={!canCreate}
          loading={loading}
          style={styles.create}
        />
      </View>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xs,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    cover: {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      backgroundColor: theme.colors.artworkPlaceholder,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    coverLabel: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    pressed: { opacity: 0.75 },
    nameCol: {
      flex: 1,
    },
    choiceRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.lg,
    },
    hint: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    create: {
      marginTop: theme.spacing.xl,
    },
  });
}
