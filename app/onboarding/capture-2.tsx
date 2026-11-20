import { useCallback, useMemo, useState } from "react";
import * as Sentry from "@sentry/react-native";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SongPickerSection } from "@/components/SongPickerSection";
import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { PhotoPickerSection } from "@/components/PhotoPickerSection";
import { LocationField } from "@/components/LocationField";
import { MoodSelector } from "@/components/MoodSelector";
import { PeopleInput } from "@/components/PeopleInput";
import { saveMoment } from "@/lib/saveMoment";
import { captureSourceFor, type SongPick } from "@/lib/captureSource";
import { friendlyError } from "@/lib/errors";
import { cancelTodaysCheckIn } from "@/lib/dailyCheckIn";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { GeoResult } from "@/lib/geocoding";
import { Song } from "@/types";

export default function OnboardingCapture2Screen() {
  const router = useRouter();
  const { user, profile, saveCustomMood, deleteCustomMood } = useAuth();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { moment1Id } = useLocalSearchParams<{ moment1Id?: string }>();

  const [song, setSong] = useState<Song | null>(null);
  // How the song was picked (now playing, Identify, search), for capture_source.
  const [songPick, setSongPick] = useState<SongPick | null>(null);
  const chooseSong = useCallback((s: Song, pick: SongPick) => {
    setSong(s);
    setSongPick(pick);
  }, []);
  const [reflection, setReflection] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [momentDate, setMomentDate] = useState<Date | null>(new Date());
  const [locationResult, setLocationResult] = useState<GeoResult | null>(null);
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
        moods: selectedMoods,
        locationResult,
        momentDate,
        captureSource: captureSourceFor({}, songPick),
      });
      markTimelineStale();
      // Today is logged: its check-in reminder has nothing left to ask.
      void cancelTodaysCheckIn();
      // Rediscover, You and the map read React Query caches, not the timeline
      // flag; without this they kept their pre-onboarding (empty) snapshot.
      invalidateMomentCaches(queryClient, user.id);
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

      {/* In the layout flow (not absolute), so scrolled content passes under
          a header with the page behind it instead of under a bare chevron. */}
      <ScreenHeader leading="back" style={styles.header} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Now a deeper one.</Text>
        <Text style={styles.subtitle}>
          A song tied to a person or moment that meant something. Take your time.
        </Text>

        <SongPickerSection song={song} onChange={chooseSong} photos={photos} />

        <SectionLabel style={styles.sectionLabel}>Reflection</SectionLabel>
        {/* The writer, not a form field: what a person writes is set in the
            reading face with no chrome, ruled off by a hairline. */}
        <TextInput
          style={styles.reflectionInput}
          placeholder="Who were you with and what was happening? (optional)"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          selectionColor={theme.colors.accentText}
          accessibilityLabel="Reflection"
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
          value={reflection}
          onChangeText={setReflection}
        />

        <SectionLabel style={styles.sectionLabel}>Photos</SectionLabel>
        <PhotoPickerSection
          photos={photos}
          onChange={setPhotos}
          onApplyMeta={handleApplyMeta}
          horizontalPadding={theme.spacing.xl}
        />

        <SectionLabel style={styles.sectionLabel}>People</SectionLabel>
        <PeopleInput people={people} onChangePeople={setPeople} />

        <SectionLabel style={styles.sectionLabel}>Mood</SectionLabel>
        <MoodSelector
          selectedMoods={selectedMoods}
          onChangeMoods={setSelectedMoods}
          customMoods={profile?.customMoods ?? []}
          saveCustomMood={saveCustomMood}
          deleteCustomMood={deleteCustomMood}
        />

        <SectionLabel
          style={styles.sectionLabel}
          right={
            momentDate ? (
              <Button label="Clear" variant="text" tone="secondary" size="pill" onPress={() => setMomentDate(null)} align="center" />
            ) : (
              <Button label="Set date" variant="text" size="pill" onPress={() => setMomentDate(new Date())} align="center" />
            )
          }
        >
          Date
        </SectionLabel>
        {momentDate ? (
          <DateTimePicker
            value={momentDate}
            mode="date"
            display="compact"
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) setMomentDate(date); }}
            themeVariant={theme.isDark ? "dark" : "light"}
            accentColor={theme.colors.text}
            style={styles.datePicker}
          />
        ) : (
          <Text style={styles.noDateText}>No specific date</Text>
        )}

        <SectionLabel style={styles.sectionLabel}>Location</SectionLabel>
        <LocationField value={locationResult} onChange={setLocationResult} detectCurrentLocation />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label="Save moment"
          onPress={handleSave}
          disabled={!song}
          loading={loading}
          style={styles.saveButton}
        />
        <Button
          label="Skip for now"
          variant="text"
          tone="secondary"
          onPress={handleSkip}
          align="center"
          style={styles.skipButton}
        />
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
      backgroundColor: theme.colors.accent, // design-lint-ignore: the onboarding progress indicator
      borderRadius: 2,
    },
    header: {
      paddingBottom: 0,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: 48,
    },
    title: {
      fontFamily: theme.fonts.display,
      fontSize: theme.fontSize["2xl"],
      lineHeight: theme.fontSize["2xl"] * 1.2,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      ...theme.typography.body,
      lineHeight: 24,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["2xl"],
    },
    sectionLabel: {
      marginTop: theme.spacing["2xl"],
      marginBottom: theme.spacing.xs,
    },
    reflectionInput: {
      ...theme.typography.reading,
      minHeight: 120,
      padding: 0,
      paddingBottom: theme.spacing.md,
      color: theme.colors.text,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    noDateText: {
      ...theme.typography.body,
      color: theme.colors.placeholder,
      paddingVertical: theme.spacing.sm,
    },
    datePicker: {
      alignSelf: "flex-start",
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.lg,
    },
    saveButton: {
      marginTop: theme.spacing["2xl"],
    },
    skipButton: {
      marginTop: theme.spacing.sm,
    },
  });
}
