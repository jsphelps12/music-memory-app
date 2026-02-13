import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  ActionSheetIOS,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/storage";
import { getSignedPhotoUrl } from "@/lib/storage";

const REFETCH_COOLDOWN_MS = 2000;

export default function ProfileScreen() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [momentCount, setMomentCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchTime = useRef(0);

  const loadProfileData = useCallback(async () => {
    await refreshProfile();

    const { count } = await supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id);

    setMomentCount(count ?? 0);
    lastFetchTime.current = Date.now();
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastFetchTime.current;
      if (lastFetchTime.current === 0) {
        loadProfileData();
      } else if (elapsed >= REFETCH_COOLDOWN_MS) {
        loadProfileData();
      }
    }, [loadProfileData])
  );

  // Load avatar signed URL when profile changes
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadAvatar() {
        if (profile?.avatarUrl) {
          const url = await getSignedPhotoUrl(profile.avatarUrl);
          if (!cancelled) setAvatarUri(url);
        } else {
          if (!cancelled) setAvatarUri(null);
        }
      }

      loadAvatar();
      return () => { cancelled = true; };
    }, [profile?.avatarUrl])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfileData();
    setRefreshing(false);
  }, [loadProfileData]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
    }
  };

  const handleAvatarPress = () => {
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
    const trimmed = nameInput.trim();
    setSavingName(true);
    try {
      await updateProfile({ displayName: trimmed || undefined });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not update name.");
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

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
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Avatar */}
      <TouchableOpacity onPress={handleAvatarPress} disabled={uploadingAvatar}>
        <View style={styles.avatarContainer}>
          {uploadingAvatar ? (
            <ActivityIndicator size="large" color="#007AFF" />
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
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleNameSave}
          />
          <TouchableOpacity onPress={handleNameSave} disabled={savingName}>
            {savingName ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditingName(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={handleNamePress}>
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
      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? (
          <ActivityIndicator color="#d32f2f" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const AVATAR_SIZE = 100;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#E8E8E8",
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
    fontWeight: "700",
    color: "#888",
  },
  changePhotoText: {
    fontSize: 14,
    color: "#007AFF",
    marginTop: 8,
    textAlign: "center",
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 20,
    color: "#333",
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  nameInput: {
    fontSize: 18,
    color: "#333",
    borderBottomWidth: 1,
    borderBottomColor: "#007AFF",
    paddingVertical: 4,
    minWidth: 160,
  },
  saveText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  cancelText: {
    fontSize: 16,
    color: "#888",
  },
  email: {
    fontSize: 15,
    color: "#888",
    marginTop: 6,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 32,
    gap: 40,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  statLabel: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  signOutButton: {
    marginTop: 48,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d32f2f",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    color: "#d32f2f",
    fontSize: 16,
    fontWeight: "600",
  },
});
