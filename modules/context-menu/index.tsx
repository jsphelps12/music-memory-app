import { requireNativeView } from "expo";
import type { ReactNode } from "react";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

// The iOS context menu around a view (1.4, modules/context-menu/ios): lift,
// blur, attached menu. Null on a build without it; callers fall back.

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

let NativeView: React.ComponentType<ContextMenuProps> | null = null;
try {
  NativeView = requireNativeView<ContextMenuProps>("ContextMenu");
} catch {
  NativeView = null;
}

export const ContextMenuView = NativeView;
