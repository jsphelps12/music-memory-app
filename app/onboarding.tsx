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
import { onOnboardingMomentSaved } from "@/lib/onboardingEvents";
import { checkUsernameAvailable } from "@/lib/friends";

const TOTAL_STEPS = 2;

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

type OnboardingPhase = "questionnaire" | "moment1_intro" | "interstitial" | "moment2_intro";

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding, saveOnboardingData, user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [phase, setPhase] = useState<OnboardingPhase>("questionnaire");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "error">("idle");
  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Username check ──────────────────────────────────────────────────────

  const handleUsernameChange = useCallback((text: string) => {
    // Enforce lowercase alphanumeric + underscores only
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

  // ── Escape hatch ────────────────────────────────────────────────────────

  async function handleSkipMoments() {
    setSaving(true);
    try {
      const data: OnboardingData = {
        displayName: displayName.trim(),
        username: username.trim() || undefined,
        birthYear,
        country: country || null,
        favoriteArtists: [],
        favoriteSongs: [],
        genrePreferences: [],
      };
      await completeOnboarding(data);
      posthog.capture("onboarding_completed", {
        has_birth_year: Boolean(data.birthYear),
        has_country: Boolean(data.country),
        skipped_moments: true,
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  // ── Questionnaire navigation ────────────────────────────────────────────

  function canAdvance(): boolean {
    if (step === 1) {
      const nameOk = displayName.trim().length > 0;
      const usernameOk = username.length >= 3 && usernameStatus === "available";
      return nameOk && usernameOk;
    }
    return true;
  }

  async function handleNext() {
    Keyboard.dismiss();
    if (!canAdvance()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (step === 1) {
        if (!displayName.trim()) setError("Please enter your name.");
        else if (usernameStatus === "error") setError("Couldn't check username availability — please try again.");
        else if (usernameStatus !== "available") setError("Please choose an available username.");
      }
      return;
    }
    setError("");

    if (step < TOTAL_STEPS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep((s) => s + 1);
      return;
    }

    // After step 2 — save name/year/country/username, then go to moment1_intro
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
      setPhase("moment1_intro");
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
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

  // ── Moment phase handlers ───────────────────────────────────────────────

  function handleCaptureMoment1() {
    const unsubscribe = onOnboardingMomentSaved(() => {
      unsubscribe();
      setPhase("interstitial");
    });
    router.push("/create?onboardingStage=1" as any);
  }

  function handleCaptureMoment2() {
    const unsubscribe = onOnboardingMomentSaved(async (payload) => {
      unsubscribe();
      const data: OnboardingData = {
        displayName: displayName.trim(),
        username: username.trim() || undefined,
        birthYear,
        country: country || null,
        favoriteArtists: [],
        favoriteSongs: [],
        genrePreferences: [],
      };
      try {
        await completeOnboarding(data);
        posthog.capture("onboarding_completed", {
          has_birth_year: Boolean(data.birthYear),
          has_country: Boolean(data.country),
          skipped_moments: false,
        });
      } catch {}
      router.replace("/(tabs)");
      setTimeout(() => {
        router.push({
          pathname: `/moment/${payload.momentId}`,
          params: { returnTo: "/celebration", fromOnboarding: "true" },
        } as any);
      }, 800);
    });
    router.push({
      pathname: "/create",
      params: {
        onboardingStage: "2",
        promptQuestion: "Where were you when you discovered your favorite song?",
        promptStarter: "I still remember the moment I first heard...",
      },
    } as any);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const progress = step / TOTAL_STEPS;

  function renderQuestionnaire() {
    return (
      <>
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
          {step === 1 ? (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.stepContent}>
                <Text style={styles.stepHeading}>Set up your profile</Text>
                <Text style={styles.stepSub}>Your name and username are how you'll appear to friends.</Text>
                <Text style={styles.fieldLabel}>Your name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Display name"
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
                <View style={styles.usernameRow}>
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
                      onSubmitEditing={handleNext}
                      maxLength={30}
                    />
                    {usernameStatus === "checking" && (
                      <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    )}
                    {usernameStatus === "available" && (
                      <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                    )}
                    {usernameStatus === "taken" && (
                      <Ionicons name="close-circle" size={18} color={theme.colors.destructive} />
                    )}
                    {usernameStatus === "error" && (
                      <Ionicons name="warning-outline" size={18} color={theme.colors.textSecondary} />
                    )}
                  </View>
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
              </View>
            </TouchableWithoutFeedback>
          ) : (
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
          )}
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
                Continue
              </Text>
            )}
          </TouchableOpacity>

          {step === 2 && (
            <TouchableOpacity
              onPress={() => {
                setError("");
                handleNext();
              }}
              activeOpacity={0.7}
              style={styles.skipLink}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  }

  function renderMoment1Intro() {
    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="musical-notes" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>What are you listening to right now?</Text>
          <Text style={styles.phaseSub}>Log the song and a quick thought — takes 30 seconds.</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={handleCaptureMoment1}
            activeOpacity={0.8}
          >
            <Text style={[styles.nextButtonText, { color: theme.colors.buttonText }]}>
              Capture now
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkipMoments}
            activeOpacity={0.7}
            style={styles.skipLink}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text style={styles.skipText}>Skip for now</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderInterstitial() {
    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="heart" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>Nice. Now the one that really matters.</Text>
          <Text style={styles.phaseSub}>
            Think of a song tied to a real memory — a place, a person, a moment in time. Tap <Text style={{ fontWeight: "700", color: theme.colors.text }}>"Add details"</Text> in the next screen to attach a photo and tag who you were with.
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={() => setPhase("moment2_intro")}
            activeOpacity={0.8}
          >
            <Text style={[styles.nextButtonText, { color: theme.colors.buttonText }]}>
              Continue →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderMoment2Intro() {
    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="time-outline" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>What's a song that means something to you?</Text>
          <Text style={styles.phaseSub}>Tap <Text style={{ fontWeight: "700", color: theme.colors.text }}>"Add details"</Text> to attach a photo and tag who you were with.</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={handleCaptureMoment2}
            activeOpacity={0.8}
          >
            <Text style={[styles.nextButtonText, { color: theme.colors.buttonText }]}>
              Capture this memory
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkipMoments}
            activeOpacity={0.7}
            style={styles.skipLink}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text style={styles.skipText}>Skip for now</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === "moment1_intro") return renderMoment1Intro();
  if (phase === "interstitial") return renderInterstitial();
  if (phase === "moment2_intro") return renderMoment2Intro();

  return (
    <View style={styles.container}>
      {renderQuestionnaire()}

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
    usernameRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    usernameInputWrap: {
      flex: 1,
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
    // Moment phases
    phaseContent: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 80,
      justifyContent: "center",
    },
    phaseIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.accentBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing["2xl"],
    },
    phaseHeading: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    phaseSub: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      lineHeight: 24,
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
