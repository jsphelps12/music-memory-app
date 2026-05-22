import { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { CloseButton } from "@/components/CloseButton";
import { friendlyError } from "@/lib/errors";
import { createAlbum, updateAlbumCover } from "@/lib/albums";
import { uploadAlbumCover } from "@/lib/storage";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export function NewSharedAlbumModal({ visible, onClose, userId }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const translateY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) { runOnJS(handleClose)(); }
      translateY.value = withTiming(0);
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(true);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setName("");
    setIsShared(true);
    setCoverUri(null);
    onClose();
  };

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
    if (!trimmed) return;
    setLoading(true);
    try {
      const album = await createAlbum(userId, trimmed, isShared);
      if (coverUri) {
        const path = await uploadAlbumCover(userId, album.id, coverUri);
        await updateAlbumCover(album.id, path);
      }
      await queryClient.invalidateQueries({ queryKey: ["collectionsScreen", userId] });
      handleClose();
      router.push({ pathname: "/album/[id]" as any, params: { id: album.id } });
    } catch (e: any) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior="padding">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.background }, animatedStyle]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>New Album</Text>
            <CloseButton onPress={handleClose} />
          </View>

          {/* Cover photo picker */}
          <TouchableOpacity onPress={handlePickCover} style={[styles.coverPicker, { backgroundColor: theme.colors.backgroundTertiary }]} activeOpacity={0.8}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={theme.colors.textTertiary} />
                <Text style={[styles.coverPlaceholderText, { color: theme.colors.textTertiary }]}>Add Cover Photo</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Personal / Shared toggle */}
          <View style={[styles.typeToggle, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundTertiary }]}>
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

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Name</Text>
          <View style={[styles.inputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}>
            <TextInput
              style={[styles.input, { color: theme.colors.text }]}
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
            <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
              You'll be taken to the album to invite members.
            </Text>
          )}
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2,
      alignSelf: "center", marginTop: 12, marginBottom: 4, opacity: 0.4,
    },
    header: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", paddingVertical: 12, marginBottom: 8,
    },
    title: { fontSize: 17, fontFamily: theme.fonts.bodySemibold },
    coverPicker: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 16,
    },
    coverPlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    coverPlaceholderText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodyMedium,
    },
    typeToggle: {
      flexDirection: "row",
      borderRadius: theme.radii.full,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 3,
      marginBottom: 20,
    },
    typePill: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: theme.radii.full,
      alignItems: "center",
    },
    typePillText: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
    },
    label: { fontSize: theme.fontSize.sm, fontFamily: theme.fonts.bodyMedium, marginBottom: 6 },
    inputRow: {
      borderRadius: theme.radii.sm, borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14, height: 48, justifyContent: "center", marginBottom: 16,
    },
    input: { fontSize: theme.fontSize.base, fontFamily: theme.fonts.body },
    createBtn: {
      height: 50, borderRadius: theme.radii.button,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    createBtnText: { color: "#fff", fontSize: theme.fontSize.base, fontFamily: theme.fonts.bodySemibold },
    hint: { fontSize: theme.fontSize.xs, textAlign: "center" },
  });
}
