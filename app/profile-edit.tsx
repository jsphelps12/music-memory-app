import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ActionSheetIOS,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { uploadAvatar, getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";

const AVATAR_SIZE = 100;

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;

  const displayName = profile?.displayName || null;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Take Photo", "Choose from Library"],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;

        if (buttonIndex === 1) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Camera permission is required to take photos.");
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
          });
        }

        if (result && !result.canceled && result.assets[0] && user) {
          setUploadingAvatar(true);
          try {
            const storagePath = await uploadAvatar(user.id, result.assets[0].uri);
            await updateProfile({ avatarUrl: storagePath });
          } catch (e) {
            Alert.alert("Upload failed", friendlyError(e));
          } finally {
            setUploadingAvatar(false);
          }
        }
      }
    );
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmed = nameInput.trim();
    setSavingName(true);
    try {
      await updateProfile({ displayName: trimmed || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", friendlyError(e));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={savingName} hitSlop={8} activeOpacity={0.7}>
          {savingName ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <TouchableOpacity onPress={handleAvatarPress} disabled={uploadingAvatar} activeOpacity={0.7}>
          <View style={styles.avatarContainer}>
            {uploadingAvatar ? (
              <ActivityIndicator size="large" color={theme.colors.accent} />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Text style={styles.initials}>{initials}</Text>
            )}
          </View>
          <Text style={styles.changePhotoText}>Change Photo</Text>
        </TouchableOpacity>

        {/* Display Name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Display name"
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>

        {/* Email (read-only) */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.fieldReadOnly}>{user?.email}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    cancelText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
    },
    saveText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.accent,
    },
    container: {
      alignItems: "center",
      paddingTop: theme.spacing["3xl"],
      paddingBottom: theme.spacing["4xl"],
      paddingHorizontal: theme.spacing.xl,
    },
    avatarContainer: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: theme.colors.backgroundTertiary,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    },
    initials: {
      fontSize: 36,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textTertiary,
    },
    changePhotoText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      marginTop: theme.spacing.sm,
      textAlign: "center",
    },
    field: {
      width: "100%",
      marginTop: theme.spacing["2xl"],
    },
    fieldLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: theme.spacing.sm,
    },
    fieldInput: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    fieldReadOnly: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
  });
}
