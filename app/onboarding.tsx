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
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { CloseButton } from "@/components/CloseButton";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth, OnboardingData } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { onOnboardingMomentSaved } from "@/lib/onboardingEvents";
import { checkUsernameAvailable } from "@/lib/friends";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Moment } from "@/types";

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

type OnboardingPhase = "questionnaire" | "value_prop" | "celebration";

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding, saveOnboardingData, user, profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();

  const [phase, setPhase] = useState<OnboardingPhase>("questionnaire");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Profile fields (all required) ──────────────────────────────────────
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

  // ── Captured moment IDs ────────────────────────────────────────────────
  const [moment1Id, setMoment1Id] = useState<string | null>(null);
  const [moment2Id, setMoment2Id] = useState<string | null>(null);

  // ── Deferred stage-2 capture: set true after stage-1 saves so that the
  //    router.back() from create.tsx fully settles before we push stage 2. ─
  const [captureStage2Pending, setCaptureStage2Pending] = useState(false);

  // ── Track whether stage-2 create was pushed (to detect dismiss-without-save) ─
  // Using a ref so it doesn't trigger re-renders, and useFocusEffect reads it.
  const stage2PushedRef = useRef(false);
  // Mirror moment1Id into a ref for safe access inside useFocusEffect callback.
  const moment1IdRef = useRef<string | null>(null);
  moment1IdRef.current = moment1Id;

  // ── Fetched moment data for celebration cards ──────────────────────────
  const [moment1Data, setMoment1Data] = useState<Moment | null>(null);
  const [moment2Data, setMoment2Data] = useState<Moment | null>(null);

  // ── Username pre-fill verification ────────────────────────────────────
  // If a username was already saved to the profile (crash-recovery reopen),
  // verify it's still available under a different user before allowing
  // continue. checkUsernameAvailable excludes the current user's own row,
  // so a user's own saved username will always come back "available" —
  // unless another account somehow claimed it (UNIQUE constraint violation
  // would have prevented that, but we verify anyway for defense in depth).
  useEffect(() => {
    if (!profile?.username || !user?.id) return;
    setUsernameStatus("checking");
    checkUsernameAvailable(profile.username, user.id)
      .then((available) => setUsernameStatus(available ? "available" : "taken"))
      .catch(() => setUsernameStatus("available")); // network error → benefit of the doubt
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally runs only on mount

  // ── Crash recovery: if the user already has moments they completed at    ─
  //    least part of the flow before a crash — complete onboarding and      ─
  //    let them straight into the app.                                       ─
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        if (count && count > 0) {
          completeOnboarding(buildOnboardingData())
            .then(() => router.replace("/(tabs)"))
            .catch(() => {
              // Silent fail — they'll try again next launch.
            });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Deferred push of stage-2 create (after stage-1 router.back settles) ─
  useEffect(() => {
    if (!captureStage2Pending) return;
    setCaptureStage2Pending(false);
    const t = setTimeout(() => { handleCaptureMoment2Internal(); }, 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureStage2Pending]);

  // ── Detect stage-2 create dismissed without saving ─────────────────────
  // Fires whenever onboarding regains focus. If stage2PushedRef is true,
  // the user opened create stage-2 and closed it without saving.
  useFocusEffect(useCallback(() => {
    if (!stage2PushedRef.current) return;
    stage2PushedRef.current = false;
    // Whether they had moment1 or skipped everything, advance to celebration.
    // renderCelebration handles 0/1 moment count gracefully.
    setPhase("celebration");
  }, []));

  useEffect(() => {
    if (!moment1Id) return;
    supabase.from("moments").select("*").eq("id", moment1Id).single()
      .then(({ data }) => { if (data) setMoment1Data(mapRowToMoment(data)); });
  }, [moment1Id]);

  useEffect(() => {
    if (!moment2Id) return;
    supabase.from("moments").select("*").eq("id", moment2Id).single()
      .then(({ data }) => { if (data) setMoment2Data(mapRowToMoment(data)); });
  }, [moment2Id]);

  // ── Username availability check ────────────────────────────────────────
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

  // ── Build onboarding data from current form state ──────────────────────
  function buildOnboardingData(): OnboardingData {
    return {
      displayName: displayName.trim(),
      username: username.trim() || undefined,
      birthYear,
      country: country || null,
      favoriteArtists: [],
      favoriteSongs: [],
      genrePreferences: [],
    };
  }

  // ── Questionnaire ──────────────────────────────────────────────────────
  function canAdvance(): boolean {
    const nameOk = displayName.trim().length > 0;
    const usernameOk = username.length >= 3 && usernameStatus === "available";
    const yearOk = birthYear !== null;
    const countryOk = country.length > 0;
    return nameOk && usernameOk && yearOk && countryOk;
  }

  async function handleQuestionnaireSubmit() {
    Keyboard.dismiss();
    if (!canAdvance()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (!displayName.trim()) setError("Please enter your name.");
      else if (usernameStatus === "error") setError("Couldn't check username — please try again.");
      else if (usernameStatus !== "available") setError("Please choose an available username.");
      else if (!birthYear) setError("Please select your birth year.");
      else if (!country) setError("Please select your country.");
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
      setPhase("value_prop");
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Moment 1 ───────────────────────────────────────────────────────────

  function handleCaptureMoment1() {
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      stage2PushedRef.current = false; // Will be re-set by handleCaptureMoment2Internal
      setMoment1Id(payload.momentId);
      // Defer stage-2 push until router.back() from create.tsx has settled.
      setCaptureStage2Pending(true);
    });
    router.push("/create?onboardingStage=1" as any);
  }

  function handleSkipMoment1() {
    // Skipping moment 1 still shows moment 2. No router.back() in flight,
    // so we can push directly.
    handleCaptureMoment2Internal();
  }

  // ── Moment 2 ───────────────────────────────────────────────────────────
  // Push create stage-2 and wire up the save listener.
  // Called from the captureStage2Pending effect (after stage-1 saves) or
  // directly from handleSkipMoment1.
  function handleCaptureMoment2Internal() {
    stage2PushedRef.current = true; // So useFocusEffect can detect a dismiss
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      stage2PushedRef.current = false; // Saved — no dismiss-detection needed
      setMoment2Id(payload.momentId);
      // Celebration either way; when hasPerson, create.tsx navigates to moment
      // detail with showShareSheet=true instead of router.back(), so the share
      // sheet appears over the moment view — onboarding just waits in celebration.
      setPhase("celebration");
    });
    router.push({
      pathname: "/create",
      params: {
        onboardingStage: "2",
        promptQuestion: "Who were you with and what was happening?",
        promptStarter: "We were...",
      },
    } as any);
  }

  // ── Finish (celebration CTA) ───────────────────────────────────────────
  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await completeOnboarding(buildOnboardingData());
      posthog.capture("onboarding_completed", {
        has_birth_year: true,
        has_country: true,
        skipped_moments: false,
        moments_saved: [moment1Id, moment2Id].filter(Boolean).length,
      });
      try {
        if (user) await registerForPushNotifications(user.id);
        posthog.capture("notifications_enabled");
      } catch {}
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  // ── Renders ────────────────────────────────────────────────────────────

  if (phase === "value_prop") return renderValueProp();
  if (phase === "celebration") return renderCelebration();

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

  // ── Questionnaire render ───────────────────────────────────────────────
  function renderQuestionnaire() {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          {/* Progress bar — step 1 of 2 */}
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: "50%" }]} />
          </View>

          {/* Header */}
          <View style={styles.topRow}>
            <Text style={styles.stepHeading}>Welcome to soundtracks.</Text>
            <Text style={styles.stepSub}>Every song holds a moment. Let's set up your profile.</Text>
          </View>

          {/* Fields */}
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
              onPress={handleQuestionnaireSubmit}
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
    );
  }

  // ── Value prop render ──────────────────────────────────────────────────
  function renderValueProp() {
    return (
      <View style={styles.container}>
        {/* Progress bar — step 2 of 2 */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: "100%" }]} />
        </View>

        {/* Back button — rendered AFTER progress bar so it layers on top cleanly */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setPhase("questionnaire")}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>

        {/* Extra top padding so the icon doesn't overlap the absolute back button */}
        <View style={[styles.phaseContent, { paddingTop: 100 }]}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="musical-note" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>Your life has a soundtrack.</Text>
          <Text style={styles.phaseSub}>
            Soundtracks builds a timeline of songs tied to your memories — the ones that take you straight back.
          </Text>

          <View style={styles.valuePropList}>
            {[
              { icon: "radio-outline" as const, text: "A song playing right now" },
              { icon: "people-outline" as const, text: "A memory shared with someone" },
              { icon: "time-outline" as const, text: "A timeline that grows with you" },
            ].map(({ icon, text }) => (
              <View key={text} style={styles.valuePropRow}>
                <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
                <Text style={[styles.valuePropText, { color: theme.colors.textSecondary }]}>{text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          {/* CTA directly opens create — no intermediate intro screen */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={handleCaptureMoment1}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Save my first moment →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkipMoment1}
            activeOpacity={0.7}
            style={styles.skipLink}
          >
            <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Celebration render ─────────────────────────────────────────────────
  function renderCelebration() {
    const momentCount = [moment1Id, moment2Id].filter(Boolean).length;
    // Show moment2 (shared) first, then moment1 (quick capture) — matches design
    const celebrationMoments = [moment2Data, moment1Data].filter(Boolean) as Moment[];

    const subtitle =
      momentCount === 0
        ? "Your timeline is ready. Start adding memories anytime."
        : momentCount === 1
        ? "One memory saved. Your soundtrack has begun."
        : "Two memories saved. Welcome.";

    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="musical-note" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>Your soundtrack starts here.</Text>
          <Text style={styles.phaseSub}>{subtitle}</Text>

          {celebrationMoments.length > 0 && (
            <View style={styles.celebrationMoments}>
              {celebrationMoments.map((m) => (
                <CelebrationMomentCard key={m.id} moment={m} theme={theme} />
              ))}
            </View>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg, opacity: saving ? 0.7 : 1 }]}
            onPress={handleFinish}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.buttonText} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Go to my timeline →</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

// ── Celebration moment card ────────────────────────────────────────────────
function CelebrationMomentCard({ moment, theme }: { moment: Moment; theme: Theme }) {
  return (
    <View style={[celebrationCardStyles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.cardBg }]}>
      <View style={celebrationCardStyles.row}>
        {moment.songArtworkUrl ? (
          <Image
            source={{ uri: moment.songArtworkUrl }}
            style={celebrationCardStyles.artwork}
            contentFit="cover"
          />
        ) : (
          <View style={[celebrationCardStyles.artworkPlaceholder, { backgroundColor: theme.colors.chipBg }]}>
            <Ionicons name="musical-note" size={20} color={theme.colors.textTertiary} />
          </View>
        )}
        <View style={celebrationCardStyles.info}>
          <Text style={[celebrationCardStyles.songName, { color: theme.colors.text }]} numberOfLines={1}>
            {moment.songTitle}
          </Text>
          <Text style={[celebrationCardStyles.artist, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {moment.songArtist}
          </Text>
        </View>
      </View>
      {Boolean(moment.reflectionText) && (
        <Text style={[celebrationCardStyles.reflection, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {moment.reflectionText}
        </Text>
      )}
      {moment.people.length > 0 && (
        <View style={celebrationCardStyles.chips}>
          {moment.people.slice(0, 3).map((p) => (
            <View key={p} style={[celebrationCardStyles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[celebrationCardStyles.chipText, { color: theme.colors.textSecondary }]}>@ {p}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const celebrationCardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  artworkPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  songName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  artist: {
    fontSize: 13,
  },
  reflection: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 12,
  },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backButton: {
      position: "absolute",
      top: 56,
      left: theme.spacing.xl,
      zIndex: 10,
    },
    progressBarTrack: {
      height: 3,
      backgroundColor: theme.colors.border,
      marginTop: 0,
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
    stepHeading: {
      fontSize: theme.fontSize["2xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    stepSub: {
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
    skipLink: {
      alignItems: "center",
      paddingVertical: 8,
    },
    skipText: {
      fontSize: theme.fontSize.sm,
    },
    // Phase screens
    phaseContent: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 64,
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
    // Value prop
    valuePropList: {
      marginTop: theme.spacing["2xl"],
      gap: 16,
    },
    valuePropRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    valuePropText: {
      fontSize: theme.fontSize.base,
    },
    // Celebration
    celebrationMoments: {
      marginTop: theme.spacing.xl,
      gap: 10,
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
