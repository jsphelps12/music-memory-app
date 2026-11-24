import { requireNativeView } from "expo";
import type { ComponentType, ReactNode } from "react";
import { View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";

// The native moment menu (modules/context-menu/ios): one UIMenu, two ways in.
// - ContextMenuView (1.4): long-press lifts the view, blurs behind it and
//   attaches the menu.
// - MenuButton (1.4.1): tap opens the same menu from a button (the "…").
// Each is null on a binary without it; callers fall back to
// components/MomentActionMenu. Both report a chosen action as onAction { id }
// once the menu has closed, and put destructive actions in their own section.

export interface ContextMenuAction {
  id: string;
  title: string;
  /** An SF Symbol name, e.g. "pencil", "trash". */
  systemImage?: string;
  destructive?: boolean;
}

export interface ContextMenuProps {
  actions: ContextMenuAction[];
  onAction: (e: { nativeEvent: { id: string } }) => void;
  /** Behind the lifted preview: the page color, so a borderless row lifts as a card. */
  previewBackgroundColor?: ColorValue;
  previewRadius?: number;
  previewInset?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export interface MenuButtonProps {
  actions: ContextMenuAction[];
  onAction: (e: { nativeEvent: { id: string } }) => void;
  /** VoiceOver label for the button. Defaults to "More". */
  label?: string;
  /** How far past its frame the button takes taps (IconButton's glass hitSlop is 4). */
  hitOutset?: number;
  /** Lands on the native button, the element UI tests tap. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * The look (the glass "…" IconButton). Drawn inside the native button and
   * sizing it, but it takes no touches and is hidden from VoiceOver: the
   * native button is the one tappable, accessible element.
   */
  children?: ReactNode;
}

type NativeMenuButtonProps = Omit<MenuButtonProps, "children" | "hitOutset"> & {
  hitOutset: number;
  hitSlop: number;
  children?: ReactNode;
};

// Whether this binary registered the view. requireNativeView never throws for
// a missing view (it hands back a component that fails when it renders), so
// ask the native view registry instead, the same lookup it uses itself.
// Build 12 has ContextMenu but not MenuButtonView.
function hasNativeView(viewName?: string): boolean {
  try {
    const expo = (globalThis as { expo?: { getViewConfig?: (module: string, view?: string) => unknown } })
      .expo;
    return !!expo?.getViewConfig?.("ContextMenu", viewName);
  } catch {
    return false;
  }
}

export const ContextMenuView: ComponentType<ContextMenuProps> | null = hasNativeView()
  ? requireNativeView<ContextMenuProps>("ContextMenu")
  : null;

function makeMenuButton(Native: ComponentType<NativeMenuButtonProps>) {
  return function MenuButton({ children, hitOutset = 0, ...rest }: MenuButtonProps) {
    return (
      <Native {...rest} hitOutset={hitOutset} hitSlop={hitOutset}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {children}
        </View>
      </Native>
    );
  };
}

export const MenuButton: ComponentType<MenuButtonProps> | null = hasNativeView("MenuButtonView")
  ? makeMenuButton(requireNativeView<NativeMenuButtonProps>("ContextMenu", "MenuButtonView"))
  : null;
