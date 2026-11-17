import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  ScrollView,
  FlatList,
  Linking,
} from "react-native";
import type { ScrollViewInstance, ViewInstance } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreventRemove } from "expo-router";
import { AppImage } from "@/components/AppImage";
import { BottomSheet } from "@/components/BottomSheet";
import { ListRow } from "@/components/ListRow";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { TextField } from "@/components/TextField";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { confirmSheet } from "@/components/ConfirmSheet";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import { uploadAvatar, getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { searchItunesArtists, searchItunesSongs } from "@/lib/musicSearch";
import { checkUsernameAvailable } from "@/lib/friends";
import { profileEditChanges } from "@/lib/profile";
import { FavoriteArtist, FavoriteSong } from "@/types";

const AVATAR_SIZE = 72;

const BIRTH_YEARS = Array.from({ length: 86 }, (_, i) => 2015 - i); // 2015 → 1930

const GENRES = [
  "Rock", "Pop", "Hip-Hop", "R&B/Soul", "Country", "Electronic",
  "Latin", "Jazz", "Folk/Indie", "Classical", "Reggae", "Metal",
];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola",
  "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile",
  "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark",
  "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini",
  "Ethiopia", "Fiji", "Finland", "France", "Gabon",
  "Gambia", "Georgia", "Germany", "Ghana", "Greece",
  "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia",
  "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
  "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco",
  "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay",
  "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino", "São Tomé and Príncipe", "Saudi Arabia",
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa",
  "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan",
  "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo",
  "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

const PICKER_ROW_HEIGHT = 52;

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, profile, updateProfile, refreshProfile } = useAuth();
  const posthog = usePostHog();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // ── Basic info ──────────────────────────────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.displayName ?? "");
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? "");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(profile?.birthYear ?? null);
  const [country, setCountry] = useState(profile?.country ?? "");
  const [saving, setSaving] = useState(false);
  // Set after a successful save so the unsaved-changes guard lets us leave.
  const [saved, setSaved] = useState(false);
  // Set when the person chooses Discard, so the guard lifts before the
  // blocked navigation repeats (Expo Router 58 defers it past the commit).
  const [discarding, setDiscarding] = useState(false);

  // ── Username check ──────────────────────────────────────────────────────
  const handleUsernameChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsernameInput(cleaned);
    setUsernameStatus("idle");
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    if (!cleaned.trim() || cleaned === profile?.username) {
      setUsernameStatus("idle");
      return;
    }
    if (cleaned.length < 3) { setUsernameStatus("taken"); return; }
    setUsernameStatus("checking");
    usernameDebounce.current = setTimeout(async () => {
      if (!user) return;
      try {
        const available = await checkUsernameAvailable(cleaned, user.id);
        setUsernameStatus(available ? "available" : "taken");
      } catch {
        setUsernameStatus("error");
      }
    }, 400);
  }, [user, profile?.username]);

  // ── Picker sheets ───────────────────────────────────────────────────────
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const filteredCountries = useMemo(
    () => COUNTRIES.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase())),
    [countrySearch]
  );

  // ── Genre preferences ───────────────────────────────────────────────────
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    profile?.genrePreferences ?? []
  );

  const toggleGenre = useCallback((genre: string) => {
    Haptics.selectionAsync();
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }, []);

  // ── Favorite artists ────────────────────────────────────────────────────
  const [selectedArtists, setSelectedArtists] = useState<FavoriteArtist[]>(
    profile?.favoriteArtists ?? []
  );
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<FavoriteArtist[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artistSectionRef = useRef<ViewInstance>(null);

  // ── Favorite songs ──────────────────────────────────────────────────────
  const [selectedSongs, setSelectedSongs] = useState<FavoriteSong[]>(
    profile?.favoriteSongs ?? []
  );
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<FavoriteSong[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const songDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songSectionRef = useRef<ViewInstance>(null);

  // The form is seeded from the profile. If the profile hadn't loaded when
  // the screen opened, seed it once it arrives (and ask for it), instead of
  // leaving every field at its empty default.
  const seededRef = useRef(profile !== null);
  useEffect(() => {
    if (!profile) {
      refreshProfile().catch(() => {});
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    setNameInput(profile.displayName ?? "");
    setUsernameInput(profile.username ?? "");
    setBirthYear(profile.birthYear ?? null);
    setCountry(profile.country ?? "");
    setSelectedGenres(profile.genrePreferences ?? []);
    setSelectedArtists(profile.favoriteArtists ?? []);
    setSelectedSongs(profile.favoriteSongs ?? []);
  // refreshProfile is recreated every render; this only reacts to the profile.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ── Unsaved changes ─────────────────────────────────────────────────────
  // The old Cancel discarded edits silently. Now that this is a pushed
  // screen, back (chevron or edge swipe) asks first when anything changed.
  // The photo isn't part of this: it uploads the moment it's picked.
  const form = {
    displayName: nameInput,
    username: usernameInput,
    birthYear,
    country,
    favoriteArtists: selectedArtists,
    favoriteSongs: selectedSongs,
    genrePreferences: selectedGenres,
  };
  const dirty = !!profile && Object.keys(profileEditChanges(profile, form)).length > 0;

  usePreventRemove(dirty && !saved && !discarding, ({ repeat }) => {
    void confirmSheet({
      title: "Discard changes?",
      message: "Your edits to your profile won't be saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    }).then((discard) => {
      if (!discard) return;
      setDiscarding(true);
      repeat();
    });
  });

  // Leave only after the render that lifted the guard.
  useEffect(() => {
    if (saved) router.back();
  }, [saved, router]);

  // Each search gets an id; only the newest one may write results, so a slow
  // response can't overwrite newer results or refill a cleared list.
  const artistRequestRef = useRef(0);
  const songRequestRef = useRef(0);

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
            Alert.alert(
              "Camera Access Required",
              "To take a photo, allow camera access in Settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ]
            );
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
    const requestId = ++artistRequestRef.current;
    if (!text.trim()) { setArtistResults([]); setArtistSearching(false); return; }
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      const results = await searchItunesArtists(text);
      if (requestId !== artistRequestRef.current) return;
      setArtistResults(results);
      setArtistSearching(false);
    }, 350);
  }, []);

  const handleSongQuery = useCallback((text: string) => {
    setSongQuery(text);
    if (songDebounce.current) clearTimeout(songDebounce.current);
    const requestId = ++songRequestRef.current;
    if (!text.trim()) { setSongResults([]); setSongSearching(false); return; }
    songDebounce.current = setTimeout(async () => {
      setSongSearching(true);
      const results = await searchItunesSongs(text);
      if (requestId !== songRequestRef.current) return;
      setSongResults(results);
      setSongSearching(false);
    }, 350);
  }, []);

  const toggleArtist = useCallback((artist: FavoriteArtist) => {
    Haptics.selectionAsync();
    setSelectedArtists((prev) => {
      if (prev.find((a) => a.id === artist.id)) return prev.filter((a) => a.id !== artist.id);
      if (prev.length >= 5) return prev;
      // Clear search after adding, and drop any search still in flight
      artistRequestRef.current++;
      if (artistDebounce.current) clearTimeout(artistDebounce.current);
      setArtistQuery("");
      setArtistResults([]);
      setArtistSearching(false);
      return [...prev, artist];
    });
  }, []);

  const toggleSong = useCallback((song: FavoriteSong) => {
    Haptics.selectionAsync();
    setSelectedSongs((prev) => {
      if (prev.find((s) => s.id === song.id)) return prev.filter((s) => s.id !== song.id);
      if (prev.length >= 5) return prev;
      // Clear search after adding, and drop any search still in flight
      songRequestRef.current++;
      if (songDebounce.current) clearTimeout(songDebounce.current);
      setSongQuery("");
      setSongResults([]);
      setSongSearching(false);
      return [...prev, song];
    });
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!profile) {
      // Saving without the loaded profile would write the form's empty
      // defaults over the real values.
      Alert.alert("Profile not loaded", "Check your connection and try again.");
      refreshProfile().catch(() => {});
      return;
    }
    if (usernameInput.trim() && usernameStatus === "taken") {
      Alert.alert("Username taken", "Please choose a different username.");
      return;
    }
    if (usernameInput.trim() && usernameStatus === "error") {
      Alert.alert("Couldn't verify username", "Check your connection and try again.");
      return;
    }
    setSaving(true);
    try {
      // Only what changed, so one edit can't overwrite another field.
      const changes = profileEditChanges(profile, form);
      await updateProfile(changes);
      posthog.capture("profile_updated", {
        has_username: !!(usernameInput.trim()),
        has_birth_year: birthYear !== null,
        has_country: !!(country.trim()),
        favorite_artists_count: selectedArtists.length,
        favorite_songs_count: selectedSongs.length,
        genre_preferences_count: selectedGenres.length,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The effect above navigates back once the guard is lifted.
      setSaved(true);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const clearArtistSearch = () => {
    artistRequestRef.current++;
    setArtistQuery("");
    setArtistResults([]);
    setArtistSearching(false);
  };
  const clearSongSearch = () => {
    songRequestRef.current++;
    setSongQuery("");
    setSongResults([]);
    setSongSearching(false);
  };

  const searchTrailing = (searching: boolean, query: string, onClear: () => void) =>
    searching ? (
      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
    ) : query.length > 0 ? (
      <TouchableOpacity onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
        <Icon name="close-circle" size={17} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    ) : null;

  const usernameTrailing =
    usernameStatus === "checking" ? (
      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
    ) : usernameStatus === "available" ? (
      <Icon name="checkmark-circle" size={18} color={theme.colors.success} />
    ) : usernameStatus === "taken" || usernameStatus === "error" ? (
      <Icon name="close-circle" size={18} color={theme.colors.destructive} />
    ) : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScreenHeader
        leading="back"
        title="Edit profile"
        right={<Button label="Save" size="pill" onPress={handleSave} loading={saving} />}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + theme.spacing["4xl"] }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarRow}>
          <Pressable
            onPress={handleAvatarPress}
            disabled={uploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
            style={styles.avatarContainer}
          >
            {uploadingAvatar ? (
              <ActivityIndicator color={theme.colors.textSecondary} />
            ) : avatarUri ? (
              <AppImage source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Text style={styles.initials}>{initials}</Text>
            )}
          </Pressable>
          <Button
            label="Change photo"
            variant="text"
            onPress={handleAvatarPress}
            disabled={uploadingAvatar}
            align="center"
          />
        </View>

        {/* ── Profile ── */}
        <SectionLabel style={styles.sectionLabel}>Profile</SectionLabel>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Display name</Text>
          <TextField
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Display name"
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            returnKeyType="done"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Username</Text>
          <TextField
            icon="at"
            value={usernameInput}
            onChangeText={handleUsernameChange}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
            returnKeyType="done"
            maxLength={30}
            trailing={usernameTrailing}
          />
          {usernameStatus === "available" && (
            <Text style={[styles.hint, styles.hintSuccess]}>Available</Text>
          )}
          {usernameStatus === "taken" && usernameInput.length >= 3 && (
            <Text style={[styles.hint, styles.hintError]}>Taken. Try another.</Text>
          )}
          {usernameStatus === "error" && (
            <Text style={[styles.hint, styles.hintError]}>Couldn&apos;t check. Try again.</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.readOnly} selectable>{user?.email}</Text>
        </View>

        {/* ── Music preferences ── */}
        <SectionLabel style={styles.sectionLabel}>Music preferences</SectionLabel>
        <Text style={styles.sectionSub}>
          Helps us surface songs that match your era and background.
        </Text>

        <View style={styles.pickerList}>
          <ListRow
            label="Birth year"
            detail={birthYear ? String(birthYear) : "Select"}
            accessibilityLabel={`Birth year, ${birthYear ? birthYear : "not set"}`}
            onPress={() => setYearPickerVisible(true)}
          />
          <ListRow
            label="Country you grew up in"
            detail={country || "Select"}
            accessibilityLabel={`Country you grew up in, ${country || "not set"}`}
            onPress={() => { setCountrySearch(""); setCountryPickerVisible(true); }}
          />
        </View>

        {/* ── Favorite artists ── */}
        <SectionLabel meta={`${selectedArtists.length} of 5`} style={styles.sectionLabel}>
          Favorite artists
        </SectionLabel>

        {selectedArtists.length > 0 && (
          <View style={styles.chips}>
            {selectedArtists.map((a) => (
              <Chip key={a.id} label={a.name} variant="filled" onRemove={() => toggleArtist(a)} />
            ))}
          </View>
        )}

        {selectedArtists.length < 5 && (
          <View ref={artistSectionRef}>
            <TextField
              icon="search"
              placeholder="Search artists"
              value={artistQuery}
              onChangeText={handleArtistQuery}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              trailing={searchTrailing(artistSearching, artistQuery, clearArtistSearch)}
            />

            {artistResults.length > 0 && (
              <View style={styles.results}>
                {artistResults.map((item) => {
                  return (
                    <ListRow
                      key={item.id}
                      label={item.name}
                      accessory="check"
                      selected={!!selectedArtists.find((a) => a.id === item.id)}
                      onPress={() => toggleArtist(item)}
                    />
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Favorite songs ── */}
        <SectionLabel meta={`${selectedSongs.length} of 5`} style={styles.sectionLabel}>
          Favorite songs
        </SectionLabel>
        <Text style={styles.sectionSub}>Songs you have strong memories of.</Text>

        {selectedSongs.length > 0 && (
          <View style={styles.chips}>
            {selectedSongs.map((s) => (
              <Chip key={s.id} label={s.title} variant="filled" onRemove={() => toggleSong(s)} />
            ))}
          </View>
        )}

        {selectedSongs.length < 5 && (
          <View ref={songSectionRef}>
            <TextField
              icon="search"
              placeholder="Search songs"
              value={songQuery}
              onChangeText={handleSongQuery}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              trailing={searchTrailing(songSearching, songQuery, clearSongSearch)}
            />

            {songResults.length > 0 && (
              <View style={styles.results}>
                {songResults.map((item) => {
                  const selected = !!selectedSongs.find((s) => s.id === item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                      onPress={() => toggleSong(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      {item.artworkUrl ? (
                        <AppImage source={{ uri: item.artworkUrl }} style={styles.songArtwork} contentFit="cover" />
                      ) : null}
                      <View style={styles.resultText}>
                        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.resultSub} numberOfLines={1}>{item.artist}</Text>
                      </View>
                      {selected && <Icon name="checkmark" size={18} color={theme.colors.text} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Genres ── */}
        <SectionLabel style={styles.sectionLabel}>Genres</SectionLabel>
        <Text style={styles.sectionSub}>Pick any that feel like you.</Text>
        <View style={styles.chips}>
          {GENRES.map((genre) => (
            <Chip
              key={genre}
              label={genre}
              variant="outline"
              selected={selectedGenres.includes(genre)}
              onPress={() => toggleGenre(genre)}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── Year picker sheet ── */}
      <BottomSheet
        visible={yearPickerVisible}
        onClose={() => setYearPickerVisible(false)}
        title="Birth year"
        maxHeight="60%"
      >
        <FlatList
          data={BIRTH_YEARS}
          keyExtractor={(y) => String(y)}
          showsVerticalScrollIndicator={false}
          initialScrollIndex={birthYear ? Math.max(0, BIRTH_YEARS.indexOf(birthYear)) : 0}
          getItemLayout={(_, index) => ({ length: PICKER_ROW_HEIGHT, offset: PICKER_ROW_HEIGHT * index, index })}
          renderItem={({ item }) => {
            return (
              <ListRow
                label={String(item)}
                accessory="check"
                selected={item === birthYear}
                onPress={() => { Haptics.selectionAsync(); setBirthYear(item); setYearPickerVisible(false); }}
                style={styles.sheetRow}
              />
            );
          }}
        />
      </BottomSheet>

      {/* ── Country picker sheet ── */}
      <BottomSheet
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title="Country"
        keyboardAvoiding
        maxHeight="60%"
      >
        <TextField
          icon="search"
          placeholder="Search"
          value={countrySearch}
          onChangeText={setCountrySearch}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          containerStyle={styles.countrySearch}
          trailing={
            countrySearch.length > 0 ? (
              <TouchableOpacity
                onPress={() => setCountrySearch("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close-circle" size={17} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null
          }
        />
        <FlatList
          data={filteredCountries}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            return (
              <ListRow
                label={item}
                accessory="check"
                selected={item === country}
                onPress={() => { Haptics.selectionAsync(); setCountry(item); setCountryPickerVisible(false); }}
                style={styles.sheetRow}
              />
            );
          }}
        />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.colors.background },
    container: {
      paddingTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
    },
    pressed: { opacity: 0.6 },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.lg,
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
      ...theme.typography.title,
      fontSize: theme.fontSize["2xl"],
      lineHeight: 34,
      color: theme.colors.textSecondary,
    },
    sectionLabel: {
      marginTop: theme.spacing["3xl"],
      marginBottom: theme.spacing.xs,
    },
    sectionSub: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    field: {
      marginTop: theme.spacing.md,
    },
    fieldLabel: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginBottom: 6,
    },
    hint: {
      ...theme.typography.meta,
      marginTop: theme.spacing.xs,
    },
    hintSuccess: { color: theme.colors.success },
    hintError: { color: theme.colors.destructive },
    readOnly: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
    },
    pickerList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    results: {
      marginTop: theme.spacing.xs,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.sm + 2,
      gap: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    songArtwork: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
    },
    resultText: { flex: 1 },
    resultTitle: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    resultSub: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    // Picker sheets
    // Fixed height so the year list's getItemLayout stays exact.
    sheetRow: {
      height: PICKER_ROW_HEIGHT,
      marginHorizontal: theme.spacing.xl,
    },
    countrySearch: {
      marginHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
    },
  });
}
