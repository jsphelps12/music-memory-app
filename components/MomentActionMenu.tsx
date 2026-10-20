import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/** Screen-space frame of the long-pressed card, from a Reanimated measure(). */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  anchor: MenuAnchor | null;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  /**
   * Fires once the menu has finished closing (after the fade-out on iOS).
   * Anything that presents another Modal, like a confirm sheet, belongs here:
   * iOS drops a presentation that starts while this Modal is still dismissing.
   */
  onDismissed?: () => void;
}

const MENU_WIDTH = 190;
const ROW_HEIGHT = 46;
const MENU_GAP = 8;
// Keep the menu clear of the status bar / notch when a card sits at the top.
const TOP_SAFE = 70;
const DISMISS_BACKSTOP_MS = 1000;

/**
 * Floating context menu anchored to a long-pressed moment card — hovers just
 * above the card (below it when the card is at the top of the screen), instead
 * of a detached system action sheet at the bottom.
 */
export function MomentActionMenu({ anchor, onEdit, onDelete, onClose, onDismissed }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // The last anchor shown. It outlives `anchor` so the Modal stays mounted with
  // visible={false} through its fade-out; unmounting it instead would skip
  // onDismiss and leave nothing to tell when the dismissal is over.
  const [shown, setShown] = useState<MenuAnchor | null>(anchor);
  if (anchor && anchor !== shown) setShown(anchor);
  const closing = !anchor && !!shown;

  // True when no close is in flight, so onDismiss and the backstop below can't
  // both report the same close.
  const settledRef = useRef(true);
  const finishDismiss = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    setShown(null);
    onDismissed?.();
  }, [onDismissed]);

  useEffect(() => {
    if (!closing) {
      settledRef.current = true;
      return;
    }
    settledRef.current = false;
    // Modal's onDismiss is iOS-only; elsewhere there is no dismissal to wait for.
    if (Platform.OS !== "ios") {
      finishDismiss();
      return;
    }
    // Backstop only, well past the fade: should onDismiss ever not arrive, the
    // menu still unmounts and a pending action still runs.
    const backstop = setTimeout(finishDismiss, DISMISS_BACKSTOP_MS);
    return () => clearTimeout(backstop);
  }, [closing, finishDismiss]);

  if (!shown) return null;

  const { width: screenWidth } = Dimensions.get("window");
  const menuHeight = ROW_HEIGHT * 2 + StyleSheet.hairlineWidth;

  const left = Math.min(
    Math.max(shown.x + shown.width / 2 - MENU_WIDTH / 2, theme.spacing.lg),
    screenWidth - MENU_WIDTH - theme.spacing.lg
  );
  const aboveTop = shown.y - menuHeight - MENU_GAP;
  const top = aboveTop >= TOP_SAFE ? aboveTop : shown.y + shown.height + MENU_GAP;

  return (
    <Modal
      transparent
      visible={!!anchor}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? finishDismiss : undefined}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { top, left }, theme.shadows.card]}>
          <TouchableOpacity style={styles.row} onPress={onEdit} activeOpacity={0.7}>
            <Text style={styles.rowText}>Edit</Text>
            <Ionicons name="pencil-outline" size={17} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={onDelete} activeOpacity={0.7}>
            <Text style={[styles.rowText, styles.destructiveText]}>Delete</Text>
            <Ionicons name="trash-outline" size={17} color={theme.colors.destructive} />
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.25)",
    },
    menu: {
      position: "absolute",
      width: MENU_WIDTH,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.lg,
    },
    rowText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    destructiveText: {
      color: theme.colors.destructive,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
  });
}
