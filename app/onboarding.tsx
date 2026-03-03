import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Keyboard,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { CloseButton } from "@/components/CloseButton";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { FavoriteArtist, FavoriteSong } from "@/types";
import { searchItunesArtists, searchItunesSongs } from "@/lib/musicSearch";

const TOTAL_STEPS = 4;

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

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [displayName, setDisplayName] = useState("");

  // Step 2
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [country, setCountry] = useState("");
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const filteredCountries = useMemo(
    () => COUNTRIES.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase())),
    [countrySearch]
  );

  // Step 3 — Artists
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<FavoriteArtist[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<FavoriteArtist[]>([]);
  const artistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 4 — Songs
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<FavoriteSong[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState<FavoriteSong[]>([]);
  const songDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search handlers ────────────────────────────────────────────────────

  const handleArtistQuery = useCallback((text: string) => {
    setArtistQuery(text);
    if (artistDebounce.current) clearTimeout(artistDebounce.current);
    if (!text.trim()) { setArtistResults([]); return; }
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      const results = await searchItunesArtists(text);
      setArtistResults(results);
      setArtistSearching(false);
    }, 350);
  }, []);

  const handleSongQuery = useCallback((text: string) => {
    setSongQuery(text);
    if (songDebounce.current) clearTimeout(songDebounce.current);
    if (!text.trim()) { setSongResults([]); return; }
    songDebounce.current = setTimeout(async () => {
      setSongSearching(true);
      const results = await searchItunesSongs(text);
      setSongResults(results);
      setSongSearching(false);
    }, 350);
  }, []);

  const toggleArtist = useCallback((artist: FavoriteArtist) => {
    Haptics.selectionAsync();
    setSelectedArtists((prev) => {
      if (prev.find((a) => a.id === artist.id)) return prev.filter((a) => a.id !== artist.id);
      if (prev.length >= 5) return prev;
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
      setSongQuery("");
      setSongResults([]);
      return [...prev, song];
    });
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────

  function canAdvance(): boolean {
    if (step === 1) return displayName.trim().length > 0;
    if (step === 3) return selectedArtists.length >= 1;
    if (step === 4) return selectedSongs.length >= 1;
    return true;
  }

  async function handleNext() {
    Keyboard.dismiss();
    if (!canAdvance()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (step === 1) setError("Please enter your name.");
      else if (step === 3) setError("Add at least one favorite artist.");
      else if (step === 4) setError("Add at least one favorite song.");
      return;
    }
    setError("");

    if (step < TOTAL_STEPS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((s) => s + 1);
      return;
    }

    // Final step — save and go
    setSaving(true);
    try {
      const data: OnboardingData = {
        displayName: displayName.trim(),
        birthYear,
        country: country || null,
        favoriteArtists: selectedArtists,
        favoriteSongs: selectedSongs,
      };
      await completeOnboarding(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  function handleBack() {
    if (step > 1) {
      Keyboard.dismiss();
      setError("");
      setStep((s) => s - 1);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  const progress = step / TOTAL_STEPS;

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>What should we call you?</Text>
              <Text style={styles.stepSub}>This shows up on shared collections and gifted memories.</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={theme.colors.placeholder}
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setError(""); }}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleNext}
                textContentType="name"
                autoComplete="name"
                maxLength={40}
              />
            </View>
          </TouchableWithoutFeedback>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>A bit about you</Text>
            <Text style={styles.stepSub}>Helps us surface songs that match your era and background.</Text>

            <Text style={styles.fieldLabel}>Birth year</Text>
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

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Country you grew up in</Text>
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

            <Text style={styles.optionalHint}>Both optional — you can update these anytime in your profile.</Text>
          </View>
        );

      case 3:
        return (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={20}
          >
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Favorite artists</Text>
              <Text style={styles.stepSub}>Pick up to 5. We'll use these to find songs that mean something to you.</Text>
            </View>

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
                    <Ionicons name="close" size={14} color="#fff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={[styles.searchRow, { borderColor: theme.colors.border }]}>
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
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
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={artistResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.resultsList}
              renderItem={({ item }) => {
                const selected = !!selectedArtists.find((a) => a.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.resultRow, selected && { backgroundColor: theme.colors.chipBg }]}
                    onPress={() => toggleArtist(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.resultTitle, selected && { color: theme.colors.accent }]}>
                      {item.name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </KeyboardAvoidingView>
        );

      case 4:
        return (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={20}
          >
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Favorite songs</Text>
              <Text style={styles.stepSub}>Pick up to 5 songs you have strong memories of.</Text>
            </View>

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
                    <Ionicons name="close" size={14} color="#fff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={[styles.searchRow, { borderColor: theme.colors.border }]}>
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
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
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={songResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.resultsList}
              renderItem={({ item }) => {
                const selected = !!selectedSongs.find((s) => s.id === item.id);
                return (
                  <TouchableOpacity
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
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </KeyboardAvoidingView>
        );
    }
  }

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Step counter + back */}
      <View style={styles.topRow}>
        {step > 1 ? (
          <TouchableOpacity onPress={handleBack} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.stepCount}>{step} of {TOTAL_STEPS}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Step body */}
      <View style={styles.body}>
        {renderStep()}
      </View>

      {/* Error */}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.colors.buttonBg, opacity: saving ? 0.7 : 1 }]}
          onPress={handleNext}
          activeOpacity={0.8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={[styles.nextButtonText, { color: theme.colors.buttonText }]}>
              {step === TOTAL_STEPS ? "Let's go" : "Continue"}
            </Text>
          )}
        </TouchableOpacity>

        {step === 2 && (
          <TouchableOpacity
            onPress={() => { setError(""); setStep((s) => s + 1); }}
            activeOpacity={0.7}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>

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
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    progressTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressFill: {
      height: 3,
      backgroundColor: theme.colors.accent,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 56,
      paddingBottom: theme.spacing.lg,
    },
    stepCount: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      fontWeight: theme.fontWeight.medium,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    stepContent: {
      paddingBottom: theme.spacing.xl,
    },
    stepHeading: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    stepSub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
      lineHeight: 22,
    },
    fieldLabel: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 52,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.backgroundInput,
    },
    pickerRowText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    optionalHint: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 16,
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
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 8,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
    resultsList: {
      flex: 1,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 2,
    },
    songArtwork: {
      width: 40,
      height: 40,
      borderRadius: 6,
      marginRight: 12,
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
      marginTop: 2,
    },
    error: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
      marginHorizontal: theme.spacing.xl,
      marginBottom: 8,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: Platform.OS === "ios" ? 44 : 24,
      paddingTop: 12,
      gap: 8,
    },
    nextButton: {
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    nextButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    skipLink: {
      alignItems: "center",
      paddingVertical: 8,
    },
    skipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
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
      borderWidth: 1,
      backgroundColor: "transparent",
    },
    countrySearchInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
  });
}
