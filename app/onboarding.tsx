import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { FavoriteArtist, FavoriteSong } from "@/types";
import { ONBOARDING_DONE_KEY } from "@/lib/onboarding";

const TOTAL_STEPS = 4;

// iTunes Search API — no MusicKit auth required
async function searchItunesArtists(query: string): Promise<FavoriteArtist[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=10`
    );
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: String(r.artistId),
      name: r.artistName,
      artworkUrl: null, // iTunes artist search doesn't return artwork
    }));
  } catch {
    return [];
  }
}

async function searchItunesSongs(query: string): Promise<FavoriteSong[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`
    );
    const json = await res.json();
    return (json.results ?? []).map((r: any) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      artworkUrl: r.artworkUrl100?.replace("100x100", "200x200") ?? null,
    }));
  } catch {
    return [];
  }
}

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
  const [birthYear, setBirthYear] = useState("");
  const [country, setCountry] = useState("");

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
      if (prev.find((a) => a.id === artist.id)) {
        return prev.filter((a) => a.id !== artist.id);
      }
      if (prev.length >= 5) return prev;
      return [...prev, artist];
    });
  }, []);

  const toggleSong = useCallback((song: FavoriteSong) => {
    Haptics.selectionAsync();
    setSelectedSongs((prev) => {
      if (prev.find((s) => s.id === song.id)) {
        return prev.filter((s) => s.id !== song.id);
      }
      if (prev.length >= 5) return prev;
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
      const parsedYear = parseInt(birthYear, 10);
      const data: OnboardingData = {
        displayName: displayName.trim(),
        birthYear: parsedYear >= 1920 && parsedYear <= 2010 ? parsedYear : null,
        country: country.trim() || null,
        favoriteArtists: selectedArtists,
        favoriteSongs: selectedSongs,
      };
      await completeOnboarding(data);
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "true");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  function handleBack() {
    if (step > 1) {
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
              returnKeyType="next"
              onSubmitEditing={handleNext}
              maxLength={40}
            />
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>A bit about you</Text>
            <Text style={styles.stepSub}>Helps us surface songs that match your era and background.</Text>

            <Text style={styles.fieldLabel}>Birth year</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1990"
              placeholderTextColor={theme.colors.placeholder}
              value={birthYear}
              onChangeText={setBirthYear}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Country you grew up in</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. United States"
              placeholderTextColor={theme.colors.placeholder}
              value={country}
              onChangeText={setCountry}
              autoCapitalize="words"
              returnKeyType="done"
            />

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

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search artists…"
                placeholderTextColor={theme.colors.placeholder}
                value={artistQuery}
                onChangeText={handleArtistQuery}
                returnKeyType="search"
              />
              {artistSearching && <ActivityIndicator size="small" color={theme.colors.accent} />}
            </View>

            <FlatList
              data={artistResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
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

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs…"
                placeholderTextColor={theme.colors.placeholder}
                value={songQuery}
                onChangeText={handleSongQuery}
                returnKeyType="search"
              />
              {songSearching && <ActivityIndicator size="small" color={theme.colors.accent} />}
            </View>

            <FlatList
              data={songResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
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

        {(step === 2) && (
          <TouchableOpacity
            onPress={() => { setError(""); setStep((s) => s + 1); }}
            activeOpacity={0.7}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
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
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    optionalHint: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
      marginTop: 12,
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
      borderColor: theme.colors.border,
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
      color: theme.colors.text,
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
  });
}
