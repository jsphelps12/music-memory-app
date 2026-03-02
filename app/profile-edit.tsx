import { useCallback, useMemo, useRef, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { uploadAvatar, getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { searchItunesArtists, searchItunesSongs } from "@/lib/musicSearch";
import { FavoriteArtist, FavoriteSong } from "@/types";

const AVATAR_SIZE = 100;

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Basic info ──────────────────────────────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.displayName ?? "");
  const [birthYearInput, setBirthYearInput] = useState(
    profile?.birthYear ? String(profile.birthYear) : ""
  );
  const [countryInput, setCountryInput] = useState(profile?.country ?? "");
  const [saving, setSaving] = useState(false);

  // ── Favorite artists ────────────────────────────────────────────────────
  const [selectedArtists, setSelectedArtists] = useState<FavoriteArtist[]>(
    profile?.favoriteArtists ?? []
  );
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<FavoriteArtist[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Favorite songs ──────────────────────────────────────────────────────
  const [selectedSongs, setSelectedSongs] = useState<FavoriteSong[]>(
    profile?.favoriteSongs ?? []
  );
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<FavoriteSong[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const songDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;
  const displayName = profile?.displayName || null;
  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  // ── Avatar ──────────────────────────────────────────────────────────────
  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Cancel", "Take Photo", "Choose from Library"], cancelButtonIndex: 0 },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;
        if (buttonIndex === 1) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Camera permission is required to take photos.");
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1],
          });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1],
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

  // ── Search handlers ─────────────────────────────────────────────────────
  const handleArtistQuery = useCallback((text: string) => {
    setArtistQuery(text);
    if (artistDebounce.current) clearTimeout(artistDebounce.current);
    if (!text.trim()) { setArtistResults([]); return; }
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      setArtistResults(await searchItunesArtists(text));
      setArtistSearching(false);
    }, 350);
  }, []);

  const handleSongQuery = useCallback((text: string) => {
    setSongQuery(text);
    if (songDebounce.current) clearTimeout(songDebounce.current);
    if (!text.trim()) { setSongResults([]); return; }
    songDebounce.current = setTimeout(async () => {
      setSongSearching(true);
      setSongResults(await searchItunesSongs(text));
      setSongSearching(false);
    }, 350);
  }, []);

  const toggleArtist = useCallback((artist: FavoriteArtist) => {
    Haptics.selectionAsync();
    setSelectedArtists((prev) => {
      if (prev.find((a) => a.id === artist.id)) return prev.filter((a) => a.id !== artist.id);
      if (prev.length >= 5) return prev;
      return [...prev, artist];
    });
  }, []);

  const toggleSong = useCallback((song: FavoriteSong) => {
    Haptics.selectionAsync();
    setSelectedSongs((prev) => {
      if (prev.find((s) => s.id === song.id)) return prev.filter((s) => s.id !== song.id);
      if (prev.length >= 5) return prev;
      return [...prev, song];
    });
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      const parsedYear = parseInt(birthYearInput, 10);
      await updateProfile({
        displayName: nameInput.trim() || undefined,
        birthYear: parsedYear >= 1920 && parsedYear <= 2010 ? parsedYear : null,
        country: countryInput.trim() || null,
        favoriteArtists: selectedArtists,
        favoriteSongs: selectedSongs,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", friendlyError(e));
    } finally {
      setSaving(false);
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
        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8} activeOpacity={0.7}>
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {/* ── Profile section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROFILE</Text>

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
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldReadOnly}>{user?.email}</Text>
          </View>
        </View>

        {/* ── Music preferences section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MUSIC PREFERENCES</Text>
          <Text style={styles.sectionSub}>
            Helps us surface songs that match your era and background.
          </Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Birth Year</Text>
            <TextInput
              style={styles.fieldInput}
              value={birthYearInput}
              onChangeText={setBirthYearInput}
              placeholder="e.g. 1990"
              placeholderTextColor={theme.colors.placeholder}
              cursorColor={theme.colors.accent}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Country You Grew Up In</Text>
            <TextInput
              style={styles.fieldInput}
              value={countryInput}
              onChangeText={setCountryInput}
              placeholder="e.g. United States"
              placeholderTextColor={theme.colors.placeholder}
              cursorColor={theme.colors.accent}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>
        </View>

        {/* ── Favorite artists ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FAVORITE ARTISTS</Text>
          <Text style={styles.sectionSub}>Up to 5. Tap to remove.</Text>

          {selectedArtists.length > 0 && (
            <View style={styles.chips}>
              {selectedArtists.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.chip, { backgroundColor: theme.colors.accent }]}
                  onPress={() => toggleArtist(a)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipText}>{a.name}</Text>
                  <Ionicons name="close" size={13} color="#fff" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedArtists.length < 5 && (
            <>
              <View style={[styles.searchRow, { borderColor: theme.colors.border }]}>
                <Ionicons name="search" size={15} color={theme.colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Search artists…"
                  placeholderTextColor={theme.colors.placeholder}
                  value={artistQuery}
                  onChangeText={handleArtistQuery}
                  returnKeyType="search"
                />
                {artistSearching && <ActivityIndicator size="small" color={theme.colors.accent} />}
              </View>

              {artistResults.map((item) => {
                const selected = !!selectedArtists.find((a) => a.id === item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.resultRow, selected && { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => toggleArtist(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.resultTitle, selected && { color: theme.colors.accent }]}>
                      {item.name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={17} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        {/* ── Favorite songs ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FAVORITE SONGS</Text>
          <Text style={styles.sectionSub}>Up to 5 songs you have strong memories of. Tap to remove.</Text>

          {selectedSongs.length > 0 && (
            <View style={styles.chips}>
              {selectedSongs.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, { backgroundColor: theme.colors.accent }]}
                  onPress={() => toggleSong(s)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipText} numberOfLines={1}>{s.title}</Text>
                  <Ionicons name="close" size={13} color="#fff" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedSongs.length < 5 && (
            <>
              <View style={[styles.searchRow, { borderColor: theme.colors.border }]}>
                <Ionicons name="search" size={15} color={theme.colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Search songs…"
                  placeholderTextColor={theme.colors.placeholder}
                  value={songQuery}
                  onChangeText={handleSongQuery}
                  returnKeyType="search"
                />
                {songSearching && <ActivityIndicator size="small" color={theme.colors.accent} />}
              </View>

              {songResults.map((item) => {
                const selected = !!selectedSongs.find((s) => s.id === item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.resultRow, selected && { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => toggleSong(item)}
                    activeOpacity={0.7}
                  >
                    {item.artworkUrl && (
                      <Image
                        source={{ uri: item.artworkUrl }}
                        style={styles.songArtwork}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.resultText}>
                      <Text style={[styles.resultTitle, selected && { color: theme.colors.accent }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.resultSub} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark" size={17} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
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
    section: {
      width: "100%",
      marginTop: theme.spacing["3xl"],
    },
    sectionLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    sectionSub: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginBottom: theme.spacing.md,
    },
    field: {
      width: "100%",
      marginTop: theme.spacing.lg,
    },
    fieldLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textSecondary,
      marginBottom: 6,
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
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    chipText: {
      color: "#fff",
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      maxWidth: 140,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      height: 40,
      marginBottom: 4,
    },
    searchIcon: {
      marginRight: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 8,
      marginBottom: 2,
    },
    songArtwork: {
      width: 36,
      height: 36,
      borderRadius: 5,
      marginRight: 10,
    },
    resultText: {
      flex: 1,
    },
    resultTitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      fontWeight: theme.fontWeight.medium,
    },
    resultSub: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
  });
}
