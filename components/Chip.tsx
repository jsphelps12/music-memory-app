import { useMemo } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { AppImage } from "@/components/AppImage";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  label: string;
  /** Tappable chips (a choice); omit for a static tag with only onRemove. */
  onPress?: () => void;
  selected?: boolean;
  /**
   * outline: a choice among options (moods, filters). Transparent with an
   * Edge outline; selected fills with ink.
   * filled: a value already chosen (a person, a place). Quiet chip paper.
   * add: the dashed "+ Add" at the end of a set.
   */
  variant?: "outline" | "filled" | "add";
  icon?: IconName;
  /** A small leading image (album art, a cover) in place of an icon. */
  imageUri?: string | null;
  /** The image is a person's photo: round, like Avatar. */
  imageRound?: boolean;
  /** e.g. long-press to delete a custom mood. */
  onLongPress?: () => void;
  accessibilityHint?: string;
  /** Shows a small remove control after the label. */
  onRemove?: () => void;
  removeLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The app's one chip (DESIGN.md, Components > Chips). Always a full pill. */
export function Chip({
  label,
  onPress,
  selected = false,
  variant = "outline",
  icon,
  imageUri,
  imageRound = false,
  onLongPress,
  accessibilityHint,
  onRemove,
  removeLabel,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const fg = selected
    ? theme.colors.chipSelectedText
    : variant === "add"
      ? theme.colors.textSecondary
      : theme.colors.chipText;

  const body = (
    <View style={styles.row}>
      {imageUri ? (
        <AppImage source={{ uri: imageUri }} style={[styles.image, imageRound && styles.imageRound]} />
      ) : icon ? (
        <Icon name={icon} size={14} color={fg} />
      ) : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={removeLabel ?? `Remove ${label}`}
        >
          <Icon name="close" size={14} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  const chipStyle = [
    styles.chip,
    variant === "outline" && styles.outline,
    variant === "filled" && styles.filled,
    variant === "add" && styles.add,
    selected && styles.selected,
    style,
  ];

  if (!onPress && !onLongPress) {
    return (
      <View style={chipStyle} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chip: {
      minHeight: 36,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.full,
      borderWidth: 1,
      borderColor: "transparent",
      justifyContent: "center",
      maxWidth: 240,
    },
    outline: {
      borderColor: theme.colors.border,
    },
    filled: {
      backgroundColor: theme.colors.fill,
    },
    add: {
      backgroundColor: theme.colors.fill,
      borderColor: theme.colors.border,
      borderStyle: "dashed",
    },
    selected: {
      backgroundColor: theme.colors.chipSelectedBg,
      borderColor: theme.colors.chipSelectedBg,
    },
    pressed: { opacity: 0.7 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    image: {
      width: 20,
      height: 20,
      borderRadius: 4,
      marginLeft: -4,
    },
    imageRound: {
      borderRadius: theme.radii.full,
    },
    label: {
      fontFamily: theme.fonts.bodyMedium,
      fontSize: theme.fontSize.sm,
      flexShrink: 1,
    },
  });
}
