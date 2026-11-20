import { useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { SongPickerSection } from "@/components/SongPickerSection";
import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { saveMoment } from "@/lib/saveMoment";
import { friendlyError } from "@/lib/errors";
import { cancelTodaysCheckIn } from "@/lib/dailyCheckIn";
import { markTimelineStale } from "@/lib/timelineRefresh";
import { invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { Song } from "@/types";

export default function OnboardingCapture1Screen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [song, setSong] = useState<Song | null>(null);
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        photos: [],
        people: [],
        moods: [],
        locationResult: null,
        momentDate: new Date(),
      });
      markTimelineStale();
      // Today is logged: its check-in reminder has nothing left to ask.
      void cancelTodaysCheckIn();
      // Rediscover, You and the map read React Query caches, not the timeline
      // flag; without this they kept their pre-onboarding (empty) snapshot.
      invalidateMomentCaches(queryClient, user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/onboarding/capture-2", params: { moment1Id: id } } as any);
    } catch (e: any) {
      Sentry.captureException(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace({ pathname: "/onboarding/capture-2", params: { moment1Id: "" } } as any);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "66%" }]} />
      </View>

      {/* In the layout flow (not absolute), so scrolled content passes under
          a header with the page behind it instead of under a bare chevron. */}
      <ScreenHeader leading="back" style={styles.header} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>What song is in your head right now?</Text>
        <Text style={styles.subtitle}>
          A song from this week, or one you just heard. Doesn&apos;t have to be meaningful yet.
        </Text>

        <SongPickerSection song={song} onChange={setSong} />

        <SectionLabel style={styles.sectionLabel}>Reflection</SectionLabel>
        {/* The writer, not a form field: what a person writes is set in the
            reading face with no chrome, ruled off by a hairline. */}
        <TextInput
          style={styles.reflectionInput}
          placeholder="What does this song remind you of? (optional)"
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
