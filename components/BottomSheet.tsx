import { ReactNode, useMemo } from "react";
import {
  DimensionValue,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CloseButton } from "@/components/CloseButton";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Header title. The header row (and its CloseButton) renders regardless. */
  title?: string;
  children: ReactNode;
  /** Wrap in KeyboardAvoidingView — for sheets containing text inputs. */
  keyboardAvoiding?: boolean;
  /** Only set these for content that needs a guaranteed tall scroll area. */
  minHeight?: DimensionValue;
  maxHeight?: DimensionValue;
  testID?: string;
}

/**
 * The one bottom sheet. Quick picks only — sized to content per the
 * screen-vs-quick-pick rule (CLAUDE.md); anything substantial gets a
 * full-screen route instead.
 *
 * Baked in, so individual sheets can't drift: backdrop dim + tap-to-close,
 * drag handle with pan-to-dismiss, and a header row with CloseButton. The pan
 * gesture lives on the grab zone (handle + header) rather than the whole
 * sheet — whole-sheet pan fights inner ScrollViews, which is how the app
 * ended up with three pan variants before this existed.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  keyboardAvoiding = false,
  minHeight,
  maxHeight = "75%",
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const translateY = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationY > 0) translateY.value = e.translationY;
        })
        .onEnd((e) => {
          if (e.translationY > 80) {
            runOnJS(onClose)();
          }
          translateY.value = withTiming(0);
        }),
    [onClose, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const body = (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        testID={testID}
        style={[styles.sheet, { minHeight, maxHeight }, animatedStyle]}
      >
        <GestureDetector gesture={panGesture}>
          <View>
            <View
              style={styles.handle}
              hitSlop={{ top: 12, bottom: 8, left: 120, right: 120 }}
            />
            <View style={styles.header}>
              {title ? <Text style={styles.title}>{title}</Text> : <View />}
              <CloseButton onPress={onClose} />
            </View>
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)",
    },
    sheet: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      paddingBottom: Platform.OS === "ios" ? 36 : 24,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    title: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
  });
}
