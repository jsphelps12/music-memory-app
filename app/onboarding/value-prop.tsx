import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { onOnboardingMomentSaved } from "@/lib/onboardingEvents";

export default function ValuePropScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [moment1Id, setMoment1Id] = useState<string | null>(null);
  const moment1IdRef = useRef<string | null>(null);
  moment1IdRef.current = moment1Id;
  const moment2IdRef = useRef<string | null>(null);

  const [captureStage2Pending, setCaptureStage2Pending] = useState(false);

  // Set true when stage-2 create is pushed; consumed by useFocusEffect when we
  // regain focus (save, hasPerson share-sheet close, or dismiss without saving).
  const stage2PushedRef = useRef(false);

  // Defer stage-2 push until stage-1's router.back() has fully settled.
  useEffect(() => {
    if (!captureStage2Pending) return;
    setCaptureStage2Pending(false);
    const t = setTimeout(() => handleCaptureMoment2Internal(), 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureStage2Pending]);

  // Single exit point to celebration: fires whenever value-prop regains focus
  // after stage-2 was pushed, regardless of how the user left create.
  useFocusEffect(useCallback(() => {
    if (!stage2PushedRef.current) return;
    stage2PushedRef.current = false;
    router.replace({
      pathname: "/onboarding/celebration",
      params: {
        moment1Id: moment1IdRef.current ?? "",
        moment2Id: moment2IdRef.current ?? "",
      },
    } as any);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  function handleCaptureMoment1() {
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      setMoment1Id(payload.momentId);
      moment1IdRef.current = payload.momentId;
      setCaptureStage2Pending(true);
    });
    router.push({ pathname: "/create", params: { onboardingStage: "1" } } as any);
  }

  function handleSkipMoment1() {
    handleCaptureMoment2Internal();
  }

  // Pushes create stage-2 and wires the save listener.
  // Called after stage-1 saves (via captureStage2Pending) or directly on skip.
  function handleCaptureMoment2Internal() {
    stage2PushedRef.current = true;
    const unsubscribe = onOnboardingMomentSaved((payload) => {
      unsubscribe();
      moment2IdRef.current = payload.momentId;
      // Don't navigate here — useFocusEffect handles it when we regain focus.
      // create.tsx may do router.replace to moment detail (hasPerson case),
      // so we wait until value-prop actually regains focus.
    });
    router.push({
      pathname: "/create",
      params: {
        onboardingStage: "2",
        promptQuestion: "Who were you with and what was happening?",
        promptStarter: "We were…",
      },
    } as any);
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: "100%" }]} />
      </View>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        hitSlop={12}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={[styles.content, { paddingTop: 100 }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="musical-note" size={36} color={theme.colors.accent} />
        </View>
        <Text style={styles.heading}>Your life has a soundtrack.</Text>
        <Text style={styles.sub}>
          Soundtracks builds a timeline of songs tied to your memories — the ones that take you straight back.
        </Text>

        <View style={styles.list}>
          {[
            { icon: "radio-outline" as const, text: "A song playing right now" },
            { icon: "people-outline" as const, text: "A memory shared with someone" },
            { icon: "time-outline" as const, text: "A timeline that grows with you" },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.listRow}>
              <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
              <Text style={[styles.listText, { color: theme.colors.textSecondary }]}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.buttonBg }]}
          onPress={handleCaptureMoment1}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>Save my first moment →</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkipMoment1} activeOpacity={0.7} style={styles.skipLink}>
          <Text style={[styles.skipText, { color: theme.colors.textSecondary }]}>Skip for now</Text>
        </TouchableOpacity>
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
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.accentBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing["2xl"],
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
      lineHeight: 24,
    },
    list: {
      marginTop: theme.spacing["2xl"],
      gap: 16,
    },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    listText: {
      fontSize: theme.fontSize.base,
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
  });
}
