import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  DimensionValue,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * Called once the sheet has finished closing and its Modal is gone. Open
   * the next sheet or screen from here, not right after onClose: iOS silently
   * drops a Modal that starts presenting while another is still dismissing.
   */
  onClosed?: () => void;
  /** Serif title at the top left. */
  title?: string;
  children: ReactNode;
  /**
   * done (default): a "Done" text button on the right. Quick picks apply as
   * you tap, so Done just closes.
   * none: no header action, for sheets that end in their own buttons
   * (ConfirmSheet: Cancel + the action).
   */
  headerAction?: "done" | "none";
  doneLabel?: string;
  /** Wrap in KeyboardAvoidingView — for sheets containing text inputs. */
  keyboardAvoiding?: boolean;
  /** Only set these for content that needs a guaranteed tall scroll area. */
  minHeight?: DimensionValue;
  maxHeight?: DimensionValue;
  testID?: string;
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const OPEN_MS = 320;
const CLOSE_MS = 220;
// After the Modal unmounts, UIKit still needs a beat to finish dismissing it
// before anything else can present (the old fixed 300ms handoff waits worked;
// 220 + 80 keeps that).
const DISMISS_SETTLE_MS = 80;
/**
 * How long a sheet takes from onClose to safely gone. Prefer `onClosed`; this
 * is only for a wrapper that doesn't pass `onClosed` through yet.
 */
export const SHEET_HANDOFF_MS = CLOSE_MS + DISMISS_SETTLE_MS;

/**
 * The one bottom sheet. Quick picks only — sized to content per the
 * screen-vs-quick-pick rule (CLAUDE.md); anything substantial gets a
 * full-screen route instead.
 *
 * Baked in, so individual sheets can't drift (DESIGN.md, Navigation >
 * Surfaces): a faint warm scrim that fades on its own while the sheet rises
 * (it used to slide up with the sheet, which read as a grey panel), Deep
 * Paper with a 20pt top radius, a grabber with pan-to-dismiss, a serif title,
 * and "Done" in ink. Content is clipped to the sheet so nothing shows past
 * its edge mid-keyboard.
 */
export function BottomSheet({
  visible,
  onClose,
  onClosed,
  title,
  children,
  headerAction = "done",
  doneLabel = "Done",
  keyboardAvoiding = false,
  minHeight,
  maxHeight = "75%",
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // The Modal stays mounted through the closing animation, then unmounts.
  const [mounted, setMounted] = useState(visible);
  const scrim = useSharedValue(0);
  const offset = useSharedValue(screenHeight);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      offset.value = reduceMotion ? 0 : screenHeight;
      scrim.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
      offset.value = withTiming(0, {
        duration: reduceMotion ? 0 : OPEN_MS,
        easing: EASE_OUT,
        reduceMotion: ReduceMotion.System,
      });
    } else if (mounted) {
      scrim.value = withTiming(0, { duration: CLOSE_MS });
      offset.value = withTiming(
        reduceMotion ? 0 : screenHeight,
        { duration: CLOSE_MS, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // onClosed: once the close animation has unmounted the Modal (not on the
  // first render of a sheet that was never open).
  const wasMounted = useRef(mounted);
  useEffect(() => {
    if (mounted) {
      wasMounted.current = true;
      return;
    }
    if (!wasMounted.current) return;
    wasMounted.current = false;
    // Not cancelled if the host unmounts meanwhile: the handoff still runs.
    if (onClosed) setTimeout(onClosed, DISMISS_SETTLE_MS);
    // A new onClosed alone re-runs this harmlessly: wasMounted is false by then.
  }, [mounted, onClosed]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          drag.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (e.translationY > 80 || e.velocityY > 900) {
            runOnJS(onClose)();
          } else {
            drag.value = withTiming(0, { duration: 180, easing: EASE_OUT });
          }
        }),
    [onClose, drag]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + drag.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;

  const body = (
    <>
      <Animated.View style={[styles.scrim, scrimStyle]} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
      <Animated.View
        testID={testID}
        accessibilityViewIsModal
        style={[styles.sheet, { minHeight, maxHeight }, sheetStyle]}
      >
        <GestureDetector gesture={panGesture}>
          <View>
            <View style={styles.handle} />
            <View style={styles.header}>
              {title ? (
                <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
                  {title}
                </Text>
              ) : (
                <View />
              )}
              {headerAction === "done" ? (
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.done, pressed && styles.pressed]}
                >
                  <Text style={styles.doneText}>{doneLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView style={styles.avoider} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.avoider}>{body}</View>
      )}
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    avoider: {
      flex: 1,
      justifyContent: "flex-end",
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.colors.scrim,
    },
    sheet: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      paddingBottom: Platform.OS === "ios" ? 34 : 24,
      // Clips content to the sheet (it used to spill past the edge while the
      // keyboard moved). The scrim, not a shadow, separates it from the page.
      overflow: "hidden",
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 2,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      paddingHorizontal: theme.spacing.xl,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
      flexShrink: 1,
    },
    done: {
      minHeight: 44,
      justifyContent: "center",
      paddingLeft: theme.spacing.lg,
    },
    doneText: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    pressed: { opacity: 0.6 },
    content: {
      flexShrink: 1,
    },
  });
}
