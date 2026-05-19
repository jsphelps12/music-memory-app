import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export type Visibility = 'private' | 'connections' | 'link';

const OPTIONS: { value: Visibility; label: string; icon: string }[] = [
  { value: 'private', label: 'Just me', icon: 'lock-closed' },
  { value: 'connections', label: 'Connections', icon: 'people' },
  { value: 'link', label: 'Anyone with link', icon: 'link' },
];

interface Props {
  value: Visibility;
  onChange: (v: Visibility) => void;
}

export function VisibilityPicker({ value, onChange }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.backgroundInput, borderColor: theme.colors.border }]}>
      {OPTIONS.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.option,
              selected && { backgroundColor: theme.colors.cardBg },
              i < OPTIONS.length - 1 && styles.optionBorder,
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={opt.icon as any}
              size={13}
              color={selected ? theme.colors.accent : theme.colors.textSecondary}
            />
            <Text style={[styles.label, { color: selected ? theme.colors.text : theme.colors.textSecondary }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    option: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 10,
    },
    optionBorder: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: "transparent",
    },
    label: {
      fontSize: 11,
      fontFamily: "DMSans_600SemiBold",
      textAlign: "center",
    },
  });
}
