import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { symbolFor } from "@/lib/iconSymbols";
import { MenuButton, type ContextMenuAction } from "@/modules/context-menu";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

/** Screen-space frame of what the menu belongs to (a card, a "…" button). */
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MomentMenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** Delete, remove from album: set in the destructive color. Never Report (it destroys nothing). */
  destructive?: boolean;
  /**
   * Runs once the menu has finished closing, never while it is still on
   * screen: iOS drops a Modal presentation (a confirm sheet, a bottom sheet)
   * that starts while this Modal is dismissing.
   */
  onPress: () => void;
}

interface Props {
  /** Non-null opens the menu beside this frame; null closes it. */
  anchor: MenuAnchor | null;
  items: MomentMenuItem[];
  /** The scrim was tapped or a row chosen: set the anchor back to null. */
  onClose: () => void;
}

/** A row as the native menu takes it: its SF Symbol is the one Icon draws for its icon. */
export function nativeMenuAction(item: MomentMenuItem): ContextMenuAction {
  return {
    id: item.key,
    title: item.label,
    systemImage: item.icon ? symbolFor(item.icon)?.symbol : undefined,
    destructive: item.destructive,
  };
}

interface MenuButtonProps {
  items: MomentMenuItem[];
  testID?: string;
  /** The look: the glass "…" IconButton. It draws and sizes the button but takes no touches. */
  children: ReactNode;
}

function NativeMomentMenuButton({ items, testID, children }: MenuButtonProps) {
  if (!MenuButton) return null;
  const onAction = (e: { nativeEvent: { id: string } }) => {
    // Reported once the native menu has closed, like a row here.
    items.find((item) => item.key === e.nativeEvent.id)?.onPress();
  };
  return (
    // hitOutset 4: the glass IconButton's hitSlop.
    <MenuButton actions={items.map(nativeMenuAction)} onAction={onAction} label="More" hitOutset={4} testID={testID}>
      {children}
    </MenuButton>
  );
}

/**
 * The "…" that opens a moment's menu as the native UIMenu (the one a
 * long-pressed card shows). Null on a binary without the native MenuButton:
 * then the caller opens MomentActionMenu from its own button instead.
 */
export const MomentMenuButton = MenuButton ? NativeMomentMenuButton : null;

const MENU_WIDTH = 220;
const ROW_HEIGHT = 48;
const MENU_GAP = 8;
const DISMISS_BACKSTOP_MS = 1000;

/**
 * The JS moment menu, from a long-pressed row in a list or the "…" on the
 * entry. Since 1.4/1.4.1 both open the native UIMenu (modules/context-menu:
 * ContextMenuView for the row, MenuButton for the "…"); this is the fallback
 * for a binary without those views, so keep its rows the same. A raised surface over the warm scrim, rows in Body with hairlines,
 * destructive rows in the destructive color. It sits just above its anchor,
 * or below it when there isn't room under the status bar, and always inside
 * the safe area.
 */
export function MomentActionMenu({ anchor, items, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // The last anchor shown. It outlives `anchor` so the Modal stays mounted with
  // visible={false} through its fade-out; unmounting it instead would skip
  // onDismiss and leave nothing to tell when the dismissal is over.
  const [shown, setShown] = useState<MenuAnchor | null>(anchor);
  // The items too, so rows don't change under the fade-out.
  const [shownItems, setShownItems] = useState(items);
  if (anchor && anchor !== shown) {
    setShown(anchor);
    setShownItems(items);
  }
  const closing = !anchor && !!shown;

  // The row chosen, run after the menu is gone.
  const pendingRef = useRef<(() => void) | null>(null);
  // True when no close is in flight, so onDismiss and the backstop below can't
  // both report the same close.
  const settledRef = useRef(true);
  const finishDismiss = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    setShown(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  }, []);

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

  const gutter = theme.spacing.lg;
  const menuHeight = ROW_HEIGHT * shownItems.length + StyleSheet.hairlineWidth * (shownItems.length - 1);
  const minTop = insets.top + theme.spacing.sm;
  const maxTop = screenHeight - insets.bottom - theme.spacing.sm - menuHeight;

  // Centered on the anchor, kept inside the side gutters.
  const left = Math.min(
    Math.max(shown.x + shown.width / 2 - MENU_WIDTH / 2, gutter),
    screenWidth - MENU_WIDTH - gutter
  );
  const above = shown.y - menuHeight - MENU_GAP;
  const below = shown.y + shown.height + MENU_GAP;
  const top = Math.max(minTop, Math.min(above >= minTop ? above : below, maxTop));

  const choose = (item: MomentMenuItem) => {
    pendingRef.current = item.onPress;
    onClose();
  };

  return (
    <Modal
      transparent
      visible={!!anchor}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? finishDismiss : undefined}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={[styles.menu, { top, left }]} accessibilityViewIsModal>
        {shownItems.map((item, i) => {
          const color = item.destructive ? theme.colors.destructive : theme.colors.text;
          return (
            <View key={item.key}>
              {i > 0 ? <View style={styles.hairline} /> : null}
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => choose(item)}
                accessibilityRole="menuitem"
              >
                <Text style={[styles.rowText, { color }]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.icon ? <Icon name={item.icon} size={18} color={color} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.colors.scrim,
    },
    // A raised surface: elevated paper with a hairline edge. The scrim, not a
    // heavy shadow, separates it from the page.
    menu: {
      position: "absolute",
      width: MENU_WIDTH,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
    },
    rowPressed: {
      backgroundColor: theme.colors.backgroundSecondary,
    },
    rowText: {
      ...theme.typography.body,
      flexShrink: 1,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
  });
}
