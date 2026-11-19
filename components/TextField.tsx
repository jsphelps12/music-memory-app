import { forwardRef, ReactNode, useMemo, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import type { TextInputInstance } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props extends Omit<TextInputProps, "style"> {
  /** A leading icon, e.g. "search". */
  icon?: IconName;
  /** Content after the input, e.g. a clear button or "Cancel". */
  trailing?: ReactNode;
  /** Tall writing field (notes, prompts). */
  multiline?: boolean;
  /**
   * ui (default): DM Sans, for names, searches and settings.
   * reading: Newsreader, for words a person writes about a moment (DESIGN.md
   * "The Who's Speaking Rule"), e.g. editing a reflection.
   */
  variant?: "ui" | "reading";
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The app's one text field (DESIGN.md, Inputs): chip-paper ground, no
 * border at rest, 12 radius, DM Sans 16. Focus draws a hairline ink edge,
 * never a terracotta box. The full-page writer is the exception and has no
 * field chrome at all; it doesn't use this.
 */
export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { icon, trailing, multiline = false, variant = "ui", containerStyle, onFocus, onBlur, ...rest },
  ref
) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        multiline && styles.multiline,
        focused && styles.focused,
        containerStyle,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={17} color={theme.colors.textSecondary} style={styles.icon} />
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.placeholder}
        selectionColor={theme.colors.accent}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          variant === "reading" && styles.inputReading,
          multiline && styles.inputMultiline,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {trailing}
    </View>
  );
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 48,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.chipBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "transparent",
      gap: theme.spacing.sm,
    },
    multiline: {
      alignItems: "flex-start",
      minHeight: 120,
      paddingVertical: theme.spacing.md,
    },
    focused: {
      borderColor: theme.colors.textTertiary,
    },
    icon: {
      marginLeft: 2,
    },
    input: {
      flex: 1,
      fontFamily: theme.fonts.body,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      paddingVertical: 12,
    },
    inputReading: {
      fontFamily: theme.fonts.reading,
      fontSize: theme.fontSize.reading,
      lineHeight: 25,
    },
    inputMultiline: {
      paddingVertical: 0,
      minHeight: 96,
    },
  });
}
