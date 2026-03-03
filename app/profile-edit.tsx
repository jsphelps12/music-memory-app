import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { CloseButton } from "@/components/CloseButton";
import { useAuth } from "@/contexts/AuthContext";
import { uploadAvatar, getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { searchItunesArtists, searchItunesSongs } from "@/lib/musicSearch";
import { FavoriteArtist, FavoriteSong } from "@/types";

const AVATAR_SIZE = 100;

const BIRTH_YEARS = Array.from({ length: 86 }, (_, i) => 2015 - i); // 2015 → 1930

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Ireland",
  "New Zealand", "Germany", "France", "Spain", "Italy", "Portugal",
  "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway",
  "Denmark", "Finland", "Poland", "Russia", "Ukraine", "Brazil", "Mexico",
  "Argentina", "Colombia", "Chile", "Peru", "Jamaica", "Trinidad and Tobago",
  "India", "China", "Japan", "South Korea", "Philippines", "Indonesia",
  "Malaysia", "Thailand", "Vietnam", "Singapore", "Pakistan", "Bangladesh",
  "Nigeria", "South Africa", "Kenya", "Egypt", "Ghana", "Ethiopia",
  "Saudi Arabia", "United Arab Emirates", "Israel", "Turkey", "Greece",
];

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);

  // ── Basic info ──────────────────────────────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.displayName ?? "");
  const [birthYear, setBirthYear] = useState<number | null>(profile?.birthYear ?? null);
  const [country, setCountry] = useState(profile?.country ?? "");
  const [saving, setSaving] = useState(false);

  // ── Picker modals ───────────────────────────────────────────────────────
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const filteredCountries = useMemo(
    () => COUNTRIES.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase())),
    [countrySearch]
  );

  // ── Favorite artists ────────────────────────────────────────────────────
  const [selectedArtists, setSelectedArtists] = useState<FavoriteArtist[]>(
    profile?.favoriteArtists ?? []
  );
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<FavoriteArtist[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artistSectionRef = useRef<View>(null);

  // ── Favorite songs ──────────────────────────────────────────────────────
  const [selectedSongs, setSelectedSongs] = useState<FavoriteSong[]>(
    profile?.favoriteSongs ?? []
  );
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<FavoriteSong[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const songDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songSectionRef = useRef<View>(null);

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;
  const displayName = profile?.displayName || null;
  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  // Scroll to results when they appear so keyboard doesn't cover them
  // measureLayout gives position relative to the ScrollView content — not screen coords
  useEffect(() => {
    if (artistResults.length > 0 && artistSectionRef.current && scrollRef.current) {
      artistSectionRef.current.measureLayout(
        scrollRef.current as any,
        (_x, y) => { scrollRef.current?.scrollTo({ y: y - 20, animated: true }); },
        () => {}
      );
    }
  }, [artistResults]);

  useEffect(() => {
    if (songResults.length > 0 && songSectionRef.current && scrollRef.current) {
      songSectionRef.current.measureLayout(
        scrollRef.current as any,
        (_x, y) => { scrollRef.current?.scrollTo({ y: y - 20, animated: true }); },
        () => {}
      );
    }
  }, [songResults]);

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
      // Clear search after adding
      setArtistQuery("");
      setArtistResults([]);
      return [...prev, artist];
    });
  }, []);

  const toggleSong = useCallback((song: FavoriteSong) => {
    Haptics.selectionAsync();
    setSelectedSongs((prev) => {
      if (prev.find((s) => s.id === song.id)) return prev.filter((s) => s.id !== song.id);
      if (prev.length >= 5) return prev;
      // Clear search after adding
      setSongQuery("");
      setSongResults([]);
      return [...prev, song];
    });
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      await updateProfile({
        displayName: nameInput.trim() || undefined,
        birthYear,
        country: country.trim() || null,
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
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
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

          {/* Birth year picker */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Birth Year</Text>
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setYearPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerRowText, !birthYear && { color: theme.colors.placeholder }]}>
                {birthYear ? String(birthYear) : "Select year"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Country picker */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Country You Grew Up In</Text>
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => { setCountrySearch(""); setCountryPickerVisible(true); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerRowText, !country && { color: theme.colors.placeholder }]}>
                {country || "Select country"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
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
            <View ref={artistSectionRef}>
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
                {artistSearching ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : artistQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => { setArtistQuery(""); setArtistResults([]); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
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
            </View>
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
            <View ref={songSectionRef}>
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
                {songSearching ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : songQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => { setSongQuery(""); setSongResults([]); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
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
                      <Image source={{ uri: item.artworkUrl }} style={styles.songArtwork} contentFit="cover" />
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
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Year picker modal ── */}
      <Modal visible={yearPickerVisible} transparent animationType="slide" onRequestClose={() => setYearPickerVisible(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setYearPickerVisible(false)} />
        <View style={[styles.pickerSheet, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.pickerSheetHandle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.pickerSheetHeader}>
            <Text style={[styles.pickerSheetTitle, { color: theme.colors.text }]}>Birth Year</Text>
            <CloseButton onPress={() => setYearPickerVisible(false)} />
          </View>
          <FlatList
            data={BIRTH_YEARS}
            keyExtractor={(y) => String(y)}
            showsVerticalScrollIndicator={false}
            initialScrollIndex={birthYear ? BIRTH_YEARS.indexOf(birthYear) : 0}
            getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
            renderItem={({ item }) => {
              const selected = item === birthYear;
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, selected && { backgroundColor: theme.colors.chipBg }]}
                  onPress={() => { Haptics.selectionAsync(); setBirthYear(item); setYearPickerVisible(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerItemText, { color: selected ? theme.colors.accent : theme.colors.text }, selected && { fontWeight: "700" }]}>
                    {item}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* ── Country picker modal ── */}
      <Modal visible={countryPickerVisible} transparent animationType="slide" onRequestClose={() => setCountryPickerVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setCountryPickerVisible(false)} />
          <View style={[styles.pickerSheet, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.pickerSheetHandle, { backgroundColor: theme.colors.border }]} />
            <View style={styles.pickerSheetHeader}>
              <Text style={[styles.pickerSheetTitle, { color: theme.colors.text }]}>Country</Text>
              <CloseButton onPress={() => setCountryPickerVisible(false)} />
            </View>
            <View style={[styles.countrySearch, { borderColor: theme.colors.border }]}>
              <Ionicons name="search" size={15} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.countrySearchInput, { color: theme.colors.text }]}
                placeholder="Search…"
                placeholderTextColor={theme.colors.placeholder}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoFocus
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(c) => c}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = item === country;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => { Haptics.selectionAsync(); setCountry(item); setCountryPickerVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerItemText, { color: selected ? theme.colors.accent : theme.colors.text }, selected && { fontWeight: "700" }]}>
                      {item}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE },
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
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.backgroundInput,
      borderRadius: theme.radii.sm,
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    pickerRowText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
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
    searchIcon: { marginRight: 6 },
    searchInput: { flex: 1, fontSize: theme.fontSize.base },
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
    resultText: { flex: 1 },
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
    // Picker modals
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    pickerSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "60%",
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    pickerSheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
      opacity: 0.4,
    },
    pickerSheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    pickerSheetTitle: {
      fontSize: 17,
      fontWeight: "600",
    },
    pickerItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 52,
      paddingHorizontal: 20,
    },
    pickerItemText: {
      fontSize: theme.fontSize.base,
    },
    countrySearch: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: "transparent",
    },
    countrySearchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
  });
}
