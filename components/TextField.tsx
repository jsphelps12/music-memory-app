import { forwardRef, ReactNode, useMemo, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props extends Omit<TextInputProps, "style"> {
  /** A leading icon, e.g. "search". */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Content after the input, e.g. a clear button or "Cancel". */
  trailing?: ReactNode;
  /** Tall writing field (notes, prompts). */
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The app's one text field (DESIGN.md, Inputs): chip-paper ground, no
 * border at rest, 12 radius, DM Sans 16. Focus draws a hairline ink edge,
 * never a terracotta box. The full-page writer is the exception and has no
 * field chrome at all; it doesn't use this.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { icon, trailing, multiline = false, containerStyle, onFocus, onBlur, ...rest },
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
        <Ionicons name={icon} size={17} color={theme.colors.textSecondary} style={styles.icon} />
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.placeholder}
        selectionColor={theme.colors.accent}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.inputMultiline]}
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
    inputMultiline: {
      paddingVertical: 0,
      minHeight: 96,
    },
  });
}
