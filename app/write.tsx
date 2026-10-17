import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { consumeWritingSession, WritingSession } from "@/lib/writingSession";
import { countWords } from "@/lib/utils";

/**
 * The full-page writer (Phase 1, 2026-10): for the journal case, where an
 * entry runs to pages. Nothing on screen but the song you're writing about,
 * the page, and a word count. Opened from capture or edit through
 * lib/writingSession.ts; Done hands the text back.
 *
 * The input is uncontrolled (defaultValue + a ref), like capture's: a
 * controlled value re-rendering under fast typing loses keystrokes, and value
 * + focus() in one tick crashed RN 0.81 natively.
 */
export default function WriteScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  // Read once: the session is consume-once, and re-reading on re-render
  // would get null.
  const [session] = useState<WritingSession | null>(() => consumeWritingSession());
  const textRef = useRef(session?.text ?? "");
  const [words, setWords] = useState(() => countWords(session?.text ?? ""));

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const handleDone = useCallback(() => {
    Haptics.selectionAsync();
    session?.onDone(textRef.current);
    close();
  }, [session, close]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.songChip}>
          {session?.songArtworkUrl ? (
            <AppImage source={{ uri: session.songArtworkUrl }} style={styles.songArt} />
          ) : null}
          <Text style={styles.songText} numberOfLines={1}>
            {session?.songTitle
              ? [session.songTitle, session.songArtist].filter(Boolean).join(" · ")
              : "Writing"}
          </Text>
        </View>
        <TouchableOpacity
          testID="write-done"
          style={styles.doneButton}
          onPress={handleDone}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        testID="write-input"
        style={styles.input}
        defaultValue={session?.text ?? ""}
        onChangeText={(t) => {
          textRef.current = t;
          setWords(countWords(t));
        }}
        placeholder={session?.placeholder ?? "Start anywhere."}
        placeholderTextColor={theme.colors.placeholder}
        cursorColor={theme.colors.accent}
        selectionColor={theme.colors.accent}
        accessibilityLabel="Write about this song"
        multiline
        autoFocus
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
        <Text style={styles.footerText}>{words === 1 ? "1 word" : `${words} words`}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingLeft: theme.spacing.xl,
      paddingRight: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    songChip: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    songArt: {
      width: 28,
      height: 28,
      borderRadius: 5,
    },
    songText: {
      flexShrink: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    doneButton: {
      height: 36,
      minWidth: 72,
      paddingHorizontal: 18,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.buttonBg,
      alignItems: "center",
      justifyContent: "center",
    },
    doneText: {
      fontSize: 15,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.buttonText,
    },
    // The page: a little bigger than capture's writing area, and it scrolls
    // itself, so pages of text stay comfortable.
    input: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      fontSize: theme.fontSize.xl,
      lineHeight: 34,
      fontFamily: theme.fonts.reading,
      color: theme.colors.text,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    footerText: {
      fontSize: theme.fontSize.xs,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
  });
}
