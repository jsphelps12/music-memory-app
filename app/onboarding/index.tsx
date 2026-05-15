import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-react-native";
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
import { Ionicons } from "@expo/vector-icons";
import { CloseButton } from "@/components/CloseButton";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { checkUsernameAvailable } from "@/lib/friends";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

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

export default function QuestionnaireScreen() {
  const router = useRouter();
  const { completeOnboarding, saveOnboardingData, user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(profile?.birthYear ?? null);
  const [country, setCountry] = useState(profile?.country ?? "");
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const filteredCountries = useMemo(
    () => COUNTRIES.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase())),
    [countrySearch]
  );

  // Verify pre-filled username on mount (crash-recovery reopen).
  // checkUsernameAvailable excludes the current user's own row, so their own
  // saved username always comes back "available".
  useEffect(() => {
    if (!profile?.username || !user?.id) return;
    setUsernameStatus("checking");
    checkUsernameAvailable(profile.username, user.id)
      .then((available) => setUsernameStatus(available ? "available" : "taken"))
      .catch(() => setUsernameStatus("available")); // network error → benefit of the doubt
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally runs only on mount

  // Crash recovery: if the user already has moments they completed at least
  // part of the flow before a crash — complete onboarding and send them into
  // the app, including the push notification registration that the normal
  // celebration screen would have handled.
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        if (count && count > 0) {
          const data: OnboardingData = {
            displayName: displayName.trim(),
            username: username.trim() || undefined,
            birthYear,
            country: country || null,
            favoriteArtists: [],
            favoriteSongs: [],
            genrePreferences: [],
          };
          completeOnboarding(data)
            .then(async () => {
              try { if (user) await registerForPushNotifications(user.id); } catch {}
              router.replace("/(tabs)" as any);
            })
            .catch(() => {
              // Silent fail — they'll try again next launch.
            });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleUsernameChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(cleaned);
    setUsernameStatus("idle");
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    if (!cleaned.trim()) return;
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
  }, [user]);

  function canAdvance(): boolean {
    return (
      displayName.trim().length > 0 &&
      username.length >= 3 &&
      usernameStatus === "available" &&
      birthYear !== null &&
      country.length > 0
    );
  }

  async function handleSubmit() {
    Keyboard.dismiss();
    if (!canAdvance()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (!displayName.trim()) {
        setError("Please enter your name.");
      } else if (usernameStatus === "error") {
        setError("Couldn't check username — please try again.");
      } else if (usernameStatus === "checking") {
        setError("Still checking username availability…");
      } else if (username.length < 3) {
        setError("Username must be at least 3 characters.");
      } else if (usernameStatus !== "available") {
        setError("That username is taken — please choose another.");
      } else if (!birthYear) {
        setError("Please select your birth year.");
      } else {
        setError("Please select your country.");
      }
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveOnboardingData({
        displayName: displayName.trim(),
        username: username.trim() || undefined,
        birthYear,
        country: country || null,
      });
      if (user) {
        posthog.identify(user.id, {
          $set: {
            display_name: displayName.trim(),
            birth_year: birthYear,
            country: country || null,
          },
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({ pathname: "/onboarding/value-prop" } as any);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: "50%" }]} />
          </View>

          <View style={styles.topRow}>
            <Text style={styles.heading}>Welcome to soundtracks.</Text>
            <Text style={styles.sub}>Every song holds a moment. Let's set up your profile.</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}
              placeholder="Your name"
              placeholderTextColor={theme.colors.placeholder}
              value={displayName}
              onChangeText={(t) => { setDisplayName(t); setError(""); }}
              autoFocus
              returnKeyType="next"
              textContentType="name"
              autoComplete="name"
              maxLength={40}
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>@username</Text>
            <View style={[styles.usernameInputWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}>
              <Text style={[styles.usernameAt, { color: theme.colors.textSecondary }]}>@</Text>
              <TextInput
                style={[styles.usernameInput, { color: theme.colors.text }]}
                placeholder="username"
                placeholderTextColor={theme.colors.placeholder}
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                maxLength={30}
              />
              {usernameStatus === "checking" && <ActivityIndicator size="small" color={theme.colors.textSecondary} />}
              {usernameStatus === "available" && <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />}
              {usernameStatus === "taken" && <Ionicons name="close-circle" size={18} color={theme.colors.destructive} />}
              {usernameStatus === "error" && <Ionicons name="warning-outline" size={18} color={theme.colors.textSecondary} />}
            </View>
            {usernameStatus === "available" && (
              <Text style={[styles.usernameHint, { color: theme.colors.success }]}>✓ Available</Text>
            )}
            {usernameStatus === "taken" && username.length < 3 && (
              <Text style={[styles.usernameHint, { color: theme.colors.destructive }]}>At least 3 characters required</Text>
            )}
            {usernameStatus === "taken" && username.length >= 3 && (
              <Text style={[styles.usernameHint, { color: theme.colors.destructive }]}>✗ Taken — try another</Text>
            )}
            {usernameStatus === "error" && (
              <Text style={[styles.usernameHint, { color: theme.colors.textSecondary }]}>Couldn't check availability — retype to retry</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Birth year</Text>
            <TouchableOpacity
              style={[styles.pickerRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}
              onPress={() => setYearPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerRowText, { color: birthYear ? theme.colors.text : theme.colors.placeholder }]}>
                {birthYear ? String(birthYear) : "Select year"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Country you grew up in</Text>
            <TouchableOpacity
              style={[styles.pickerRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundInput }]}
              onPress={() => { setCountrySearch(""); setCountryPickerVisible(true); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerRowText, { color: country ? theme.colors.text : theme.colors.placeholder }]}>
                {country || "Select country"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.buttonText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Continue →</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* Year picker modal */}
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

      {/* Country picker modal */}
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
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
    },
    progressBarFill: {
      height: 3,
      backgroundColor: theme.colors.accent,
      borderRadius: 2,
    },
    topRow: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 72,
      paddingBottom: theme.spacing.xl,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    heading: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    sub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
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
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
    },
    usernameInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      height: 52,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      gap: 4,
    },
    usernameAt: {
      fontSize: theme.fontSize.base,
    },
    usernameInput: {
      flex: 1,
      fontSize: theme.fontSize.base,
    },
    usernameHint: {
      fontSize: theme.fontSize.xs,
      marginTop: 6,
    },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 52,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
    },
    pickerRowText: {
      fontSize: theme.fontSize.base,
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
    primaryButton: {
      height: 52,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
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
