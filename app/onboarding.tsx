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
  Share,
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
import { onOnboardingMomentSaved } from "@/lib/onboardingEvents";
import { checkUsernameAvailable } from "@/lib/friends";
import { registerForPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { getPublicPhotoUrl } from "@/lib/storage";
import { ShareCardModal } from "@/components/ShareCardModal";
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

type OnboardingPhase =
  | "questionnaire"
  | "value_prop"
  | "moment1_intro"
  | "moment2_intro"
  | "share"
  | "celebration";

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

  // ── Share sheet visibility (separate from phase so it can animate out) ─
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  // ── Share screen person info ───────────────────────────────────────────
  const [taggedPersonName, setTaggedPersonName] = useState<string | null>(null);
  const [taggedPersonUserId, setTaggedPersonUserId] = useState<string | null>(null);

  // ── Fetched moment data (for share card + celebration cards) ───────────
  const [moment1Data, setMoment1Data] = useState<Moment | null>(null);
  const [moment2Data, setMoment2Data] = useState<Moment | null>(null);
  const [shareCardVisible, setShareCardVisible] = useState(false);

  useEffect(() => {
    if (phase === "share") setShareSheetVisible(true);
  }, [phase]);

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
  function handleSkipMoment1() {
    // Skip moment 1 → still go to moment 2
    setPhase("moment2_intro");
  }

  function handleCaptureMoment1() {
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      setMoment1Id(payload.momentId);
      setPhase("moment2_intro");
    });
    router.push("/create?onboardingStage=1" as any);
  }

  // ── Moment 2 ───────────────────────────────────────────────────────────
  function handleSkipMoment2() {
    setError("");
    if (moment1Id) {
      // Saved moment 1, skipped moment 2 → show celebration with 1 moment
      setPhase("celebration");
    } else {
      // Skipped both → complete onboarding and go straight to timeline
      handleSkipBoth();
    }
  }

  async function handleSkipBoth() {
    setSaving(true);
    setError("");
    try {
      await completeOnboarding(buildOnboardingData());
      posthog.capture("onboarding_completed", {
        has_birth_year: true,
        has_country: true,
        skipped_moments: true,
        moments_saved: 0,
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(friendlyError(e));
      setSaving(false);
    }
  }

  function handleCaptureMoment2() {
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      setMoment2Id(payload.momentId);
      if (payload.hasPerson) {
        setTaggedPersonName(payload.taggedPersonName ?? null);
        setTaggedPersonUserId(payload.taggedPersonUserId ?? null);
        setPhase("share");
      } else {
        setPhase("celebration");
      }
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

  // ── Share screen ───────────────────────────────────────────────────────
  function closeShareSheetThen(next: () => void) {
    setShareSheetVisible(false);
    // Wait for the sheet slide-down animation before transitioning
    setTimeout(next, 300);
  }

  function handleShareCard() {
    closeShareSheetThen(() => setShareCardVisible(true));
  }

  async function handleShareLink() {
    const inviteUrl = profile?.friendInviteToken
      ? `https://soundtracks.app/friend/${profile.friendInviteToken}`
      : "https://soundtracks.app";
    closeShareSheetThen(async () => {
      try {
        await Share.share({ message: inviteUrl, url: inviteUrl });
      } catch {}
      setPhase("celebration");
    });
  }

  function handleShareMaybeLater() {
    closeShareSheetThen(() => setPhase("celebration"));
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
  if (phase === "moment1_intro") return renderMoment1Intro();
  if (phase === "moment2_intro") return renderMoment2Intro();
  if (phase === "share") return renderShare();
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setPhase("questionnaire")}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.phaseContent}>
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
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={() => setPhase("moment1_intro")}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Save my first moment →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Moment 1 intro render ──────────────────────────────────────────────
  function renderMoment1Intro() {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setPhase("value_prop")}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.phaseContent}>
          <Text style={styles.phaseHeading}>What are you listening to?</Text>
          <Text style={styles.phaseSub}>The create screen will guide you.</Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={handleCaptureMoment1}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Save →</Text>
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

  // ── Moment 2 intro render ──────────────────────────────────────────────
  function renderMoment2Intro() {
    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <Text style={styles.phaseHeading}>Capture a memory</Text>
          <Text style={[styles.phaseSub, { marginTop: 8 }]}>Pick a song tied to a real moment. Tag who you were with.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
            onPress={handleCaptureMoment2}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Save moment →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkipMoment2}
            activeOpacity={0.7}
            style={styles.skipLink}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Skip for now</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Share screen render ────────────────────────────────────────────────
  function renderShare() {
    const personName = taggedPersonName ?? "them";
    const isOnApp = Boolean(taggedPersonUserId);
    const shareableMoment = moment2Data ?? moment1Data;
    const shareablePhotoUrls = shareableMoment?.photoUrls.map(getPublicPhotoUrl) ?? [];

    return (
      <View style={styles.container}>
        {/* Background: the just-saved moment card */}
        <View style={[styles.phaseContent, { justifyContent: "flex-start", paddingTop: 80 }]}>
          <Text style={[styles.phaseHeading, { marginBottom: 4 }]}>
            Share with {personName}?
          </Text>
          <Text style={styles.phaseSub}>They were part of this memory.</Text>
          {shareableMoment && (
            <View style={{ marginTop: theme.spacing["2xl"] }}>
              <CelebrationMomentCard moment={shareableMoment} theme={theme} />
            </View>
          )}
        </View>

        {/* Share options — bottom sheet Modal sliding up over the background */}
        <Modal
          visible={shareSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={handleShareMaybeLater}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleShareMaybeLater}
          />
          <View style={[styles.shareSheet, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.pickerSheetHandle, { backgroundColor: theme.colors.border }]} />
            <View style={styles.shareSheetHeader}>
              <Text style={[styles.shareSheetTitle, { color: theme.colors.text }]}>
                Share with {personName}?
              </Text>
              <Text style={[styles.shareSheetSub, { color: theme.colors.textSecondary }]}>
                They were part of this memory.
              </Text>
            </View>

            <View style={styles.shareOptionsList}>
              <TouchableOpacity
                style={[styles.shareOption, { borderColor: theme.colors.border }]}
                onPress={handleShareCard}
                activeOpacity={0.7}
              >
                <View style={[styles.shareOptionIcon, { backgroundColor: theme.colors.accentBg }]}>
                  <Ionicons name="image-outline" size={22} color={theme.colors.accent} />
                </View>
                <View style={styles.shareOptionText}>
                  <Text style={[styles.shareOptionTitle, { color: theme.colors.text }]}>Create share card</Text>
                  <Text style={[styles.shareOptionSub, { color: theme.colors.textSecondary }]}>A designed image for Stories</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shareOption, { borderColor: theme.colors.border }]}
                onPress={handleShareLink}
                activeOpacity={0.7}
              >
                <View style={[styles.shareOptionIcon, { backgroundColor: theme.colors.accentBg }]}>
                  <Ionicons name="link-outline" size={22} color={theme.colors.accent} />
                </View>
                <View style={styles.shareOptionText}>
                  <Text style={[styles.shareOptionTitle, { color: theme.colors.text }]}>Share link</Text>
                  <Text style={[styles.shareOptionSub, { color: theme.colors.textSecondary }]}>Send via text, email or anywhere</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              <View style={[styles.shareOption, { borderColor: theme.colors.border, opacity: isOnApp ? 1 : 0.45 }]}>
                <View style={[styles.shareOptionIcon, { backgroundColor: theme.colors.chipBg }]}>
                  <Ionicons name="phone-portrait-outline" size={22} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.shareOptionText}>
                  <Text style={[styles.shareOptionTitle, { color: theme.colors.text }]}>Send in app</Text>
                  <Text style={[styles.shareOptionSub, { color: theme.colors.textSecondary }]}>
                    {isOnApp ? `${personName} is on soundtracks` : `When ${personName} joins soundtracks`}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleShareMaybeLater}
              activeOpacity={0.7}
              style={[styles.skipLink, { marginBottom: Platform.OS === "ios" ? 24 : 12 }]}
            >
              <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* ShareCardModal — opens after share sheet animates out */}
        {shareableMoment && (
          <ShareCardModal
            visible={shareCardVisible}
            moment={shareableMoment}
            photoUrls={shareablePhotoUrls}
            onClose={() => {
              setShareCardVisible(false);
              setPhase("celebration");
            }}
          />
        )}
      </View>
    );
  }

  // ── Celebration render ─────────────────────────────────────────────────
  function renderCelebration() {
    const momentCount = [moment1Id, moment2Id].filter(Boolean).length;
    // Show moment2 (shared) first, then moment1 (quick capture) — matches design
    const celebrationMoments = [moment2Data, moment1Data].filter(Boolean) as Moment[];

    return (
      <View style={styles.container}>
        <View style={styles.phaseContent}>
          <View style={styles.phaseIconCircle}>
            <Ionicons name="musical-note" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.phaseHeading}>Your soundtrack starts here.</Text>
          <Text style={styles.phaseSub}>
            {momentCount === 2 ? "Two memories saved. Welcome." : "One memory saved. Welcome."}
          </Text>

          {/* Saved moment cards */}
          {celebrationMoments.length > 0 && (
            <View style={styles.celebrationMoments}>
              {celebrationMoments.map((m) => (
                <CelebrationMomentCard key={m.id} moment={m} theme={theme} />
              ))}
            </View>
          )}

          {/* Invite banner */}
          {taggedPersonName && (
            <View style={[styles.inviteBanner, { backgroundColor: theme.colors.accentSecondaryBg, borderColor: theme.colors.border }]}>
              <View style={styles.inviteBannerRow}>
                <View style={[styles.inviteAvatar, { backgroundColor: theme.colors.chipBg }]}>
                  <Text style={[styles.inviteAvatarInitial, { color: theme.colors.textSecondary }]}>
                    {taggedPersonName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inviteBannerTitle, { color: theme.colors.text }]}>
                    Invite {taggedPersonName} to soundtracks
                  </Text>
                  <Text style={[styles.inviteBannerSub, { color: theme.colors.textSecondary }]}>
                    They can see this memory and build their own soundtrack.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.inviteButton, { backgroundColor: theme.colors.accentSecondary }]}
                onPress={handleShareLink}
                activeOpacity={0.8}
              >
                <Text style={[styles.inviteButtonText, { color: "#fff" }]}>Send invite →</Text>
              </TouchableOpacity>
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
    // Share screen bottom sheet
    shareSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
    },
    shareSheetHeader: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 12,
      paddingBottom: 16,
    },
    shareSheetTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      marginBottom: 4,
    },
    shareSheetSub: {
      fontSize: theme.fontSize.sm,
    },
    shareOptionsList: {
      paddingHorizontal: theme.spacing.xl,
      gap: 10,
    },
    shareOption: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      gap: 14,
    },
    shareOptionIcon: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    shareOptionText: {
      flex: 1,
    },
    shareOptionTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      marginBottom: 2,
    },
    shareOptionSub: {
      fontSize: theme.fontSize.sm,
    },
    // Celebration
    celebrationMoments: {
      marginTop: theme.spacing.xl,
      gap: 10,
    },
    inviteBanner: {
      marginTop: theme.spacing["2xl"],
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      gap: 12,
    },
    inviteBannerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    inviteAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    inviteAvatarInitial: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    inviteBannerTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      marginBottom: 2,
    },
    inviteBannerSub: {
      fontSize: theme.fontSize.sm,
      lineHeight: 18,
    },
    inviteButton: {
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    inviteButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
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
