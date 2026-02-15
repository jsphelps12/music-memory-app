import { useCallback, useMemo, useRef, useState, } from "react";
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
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadAvatar, getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SkeletonProfile } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { friendlyError } from "@/lib/errors";

const REFETCH_COOLDOWN_MS = 2000;

export default function ProfileScreen() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [momentCount, setMomentCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bannerError, setBannerError] = useState("");
  const lastFetchTime = useRef(0);

  const loadProfileData = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoadError("");
      setBannerError("");

      await refreshProfile();

      const { count, error: countError } = await supabase
        .from("moments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);

      if (countError) throw countError;

      setMomentCount(count ?? 0);
      lastFetchTime.current = Date.now();
      setInitialLoading(false);
    } catch (e) {
      if (isInitial) {
        setLoadError(friendlyError(e));
        setInitialLoading(false);
      } else {
        setBannerError(friendlyError(e));
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        loadProfileData(true);
      } else if (elapsed >= REFETCH_COOLDOWN_MS) {
        loadProfileData(false);
      }
    }, [loadProfileData])
  );

  const avatarUri = profile?.avatarUrl
    ? getPublicPhotoUrl(profile.avatarUrl)
    : null;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfileData(false);
    setRefreshing(false);
  }, [loadProfileData]);

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch (e) {
      setSignOutError(friendlyError(e));
      setSigningOut(false);
    }
  };

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

        if (result && !result.canceled && result.assets[0]) {
          setUploadingAvatar(true);
          try {
            const storagePath = await uploadAvatar(user!.id, result.assets[0].uri);
            await updateProfile({ avatarUrl: storagePath });
          } catch (e: any) {
            Alert.alert("Upload failed", e.message ?? "Could not upload avatar.");
          } finally {
            setUploadingAvatar(false);
          }
        }
      }
    );
  };

  const handleNamePress = () => {
    setNameInput(profile?.displayName ?? "");
    setEditingName(true);
  };

  const handleNameSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmed = nameInput.trim();
    setSavingName(true);
    try {
      await updateProfile({ displayName: trimmed || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e.message ?? "Could not update name.");
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  if (initialLoading) {
    return (
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.container}
      >
        <SkeletonProfile />
      </ScrollView>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => loadProfileData(true)}
      />
    );
  }

  const displayName = profile?.displayName || null;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.text}
        />
      }
    >
      {bannerError ? (
        <ErrorBanner
          message={bannerError}
          onRetry={() => loadProfileData(false)}
          onDismiss={() => setBannerError("")}
        />
      ) : null}

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
      {editingName ? (
        <View style={styles.nameEditRow}>
          <TextInput
            style={styles.nameInput}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Display name"
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleNameSave}
          />
          <TouchableOpacity onPress={handleNameSave} disabled={savingName} activeOpacity={0.7}>
            {savingName ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditingName(false)} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={handleNamePress} activeOpacity={0.7}>
          <Text style={styles.displayName}>
            {displayName ?? "Add your name"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Email */}
      <Text style={styles.email}>{user?.email}</Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {momentCount !== null ? momentCount : "-"}
          </Text>
          <Text style={styles.statLabel}>Moments</Text>
        </View>
        {memberSince && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{memberSince}</Text>
            <Text style={styles.statLabel}>Member since</Text>
          </View>
        )}
      </View>

      {/* Sign Out */}
      {signOutError ? (
        <Text style={styles.signOutErrorText}>{signOutError}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.7}
      >
        {signingOut ? (
          <ActivityIndicator color={theme.colors.destructive} />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const AVATAR_SIZE = 100;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      alignItems: "center",
      paddingTop: 80,
      paddingBottom: 40,
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
    displayName: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      marginTop: theme.spacing.xl,
      color: theme.colors.text,
    },
    nameEditRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: theme.spacing.xl,
    },
    nameInput: {
      fontSize: theme.fontSize.lg,
      color: theme.colors.text,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.accent,
      paddingVertical: theme.spacing.xs,
      minWidth: 160,
    },
    saveText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.semibold,
    },
    cancelText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textTertiary,
    },
    email: {
      fontSize: 15,
      color: theme.colors.textTertiary,
      marginTop: 6,
    },
    statsRow: {
      flexDirection: "row",
      marginTop: theme.spacing["3xl"],
      gap: theme.spacing["4xl"],
    },
    statItem: {
      alignItems: "center",
    },
    statValue: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    statLabel: {
      fontSize: 13,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    signOutErrorText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing["2xl"],
      textAlign: "center",
    },
    signOutButton: {
      marginTop: theme.spacing.lg,
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["3xl"],
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.destructive,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    signOutText: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
  });
}
