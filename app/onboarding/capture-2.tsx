import { useMemo, useState } from "react";
import * as Sentry from "@sentry/react-native";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SongPickerSection } from "@/components/SongPickerSection";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { LocationField } from "@/components/LocationField";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { saveMoment } from "@/lib/saveMoment";
import { friendlyError } from "@/lib/errors";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { GeoResult } from "@/lib/geocoding";
import { Song } from "@/types";

export default function OnboardingCapture2Screen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { moment1Id } = useLocalSearchParams<{ moment1Id?: string }>();

  const [song, setSong] = useState<Song | null>(null);
  const [reflection, setReflection] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
  const [focusedField, setFocusedField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApplyMeta = (
    date: Date | undefined,
    location: { name: string; lat: number | null; lng: number | null } | undefined
  ) => {
    if (date) setMomentDate(date);
    if (location) setLocationResult(location);
  };

  const handleSave = async () => {
    if (!song || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    setLoading(true);
    try {
      const { id } = await saveMoment({
        userId: user.id,
        song,
        reflection,
        photos,
        people,
        mood: selectedMood,
        locationResult,
        momentDate,
      });
      markTimelineStale();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/onboarding/moment-preview",
        params: {
          moment1Id: moment1Id ?? "",
          moment2Id: id,
        },
      } as any);
    } catch (e: any) {
      Sentry.captureException(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (moment1Id) {
      // At least one moment exists — show the preview
      router.replace({
        pathname: "/onboarding/moment-preview",
        params: { moment1Id, moment2Id: "" },
      } as any);
    } else {
      // No moments at all — skip straight to celebration
      router.replace({
        pathname: "/onboarding/celebration",
        params: { moment1Id: "", moment2Id: "" },
      } as any);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "100%" }]} />
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Now a deeper one.</Text>
        <Text style={styles.subtitle}>
          A song tied to a person or moment that meant something. Take your time.
        </Text>

        <SongPickerSection song={song} onChange={setSong} photos={photos} />

        <Text style={styles.sectionLabel}>Reflection</Text>
        <TextInput
          style={[styles.reflectionInput, focusedField && { borderColor: theme.colors.accent }]}
          placeholder="Who were you with and what was happening? (optional)"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
          value={reflection}
          onChangeText={setReflection}
          onFocus={() => setFocusedField(true)}
          onBlur={() => setFocusedField(false)}
        />

        <Text style={styles.sectionLabel}>Photos</Text>
        <PhotoPickerSection
          photos={photos}
          onChange={setPhotos}
          onApplyMeta={handleApplyMeta}
          horizontalPadding={20}
        />

        <Text style={styles.sectionLabel}>People</Text>
        <PeopleInput people={people} onChangePeople={setPeople} />

        <Text style={styles.sectionLabel}>Mood</Text>
        <MoodSelector
          selectedMood={selectedMood}
          onSelectMood={setSelectedMood}
          customMoods={profile?.customMoods ?? []}
          saveCustomMood={saveCustomMood}
          deleteCustomMood={deleteCustomMood}
        />

        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>Date</Text>
          {momentDate ? (
            <TouchableOpacity onPress={() => setMomentDate(null)} hitSlop={8}>
              <Text style={styles.dateClearText}>Clear</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setMomentDate(new Date())} hitSlop={8}>
              <Text style={styles.dateSetText}>Set date</Text>
            </TouchableOpacity>
          )}
        </View>
        {momentDate ? (
          <DateTimePicker
            value={momentDate}
            mode="date"
            display="compact"
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) setMomentDate(date); }}
            themeVariant={theme.isDark ? "dark" : "light"}
            accentColor={theme.colors.accent}
            style={styles.datePicker}
          />
        ) : (
          <Text style={styles.noDateText}>No specific date</Text>
        )}

        <Text style={styles.sectionLabel}>Location</Text>
        <LocationField value={locationResult} onChange={setLocationResult} detectCurrentLocation />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveButton, { opacity: !song || loading ? 0.5 : 1 }]}
          onPress={handleSave}
          disabled={!song || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>Save moment →</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipLink} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    backButton: {
      position: "absolute",
      top: 56,
      left: theme.spacing.xl,
      zIndex: 10,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: 100,
      paddingBottom: 48,
    },
    title: {
      fontSize: theme.fontSize["2xl"],
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      lineHeight: 24,
      marginBottom: theme.spacing["2xl"],
    },
    sectionLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.sm,
    },
    reflectionInput: {
      height: 120,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    dateClearText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
    },
    dateSetText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
    noDateText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.placeholder,
      paddingVertical: theme.spacing.sm,
    },
    datePicker: {
      alignSelf: "center",
    },
    error: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.lg,
    },
    saveButton: {
      height: 52,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: theme.radii.button,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing["2xl"],
    },
    saveButtonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
    },
    skipLink: {
      alignItems: "center",
      paddingVertical: 12,
      marginTop: 8,
    },
    skipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
  });
}
