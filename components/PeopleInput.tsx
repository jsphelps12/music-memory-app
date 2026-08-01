import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// Free-text chips only (Social Architecture v2): this field is a personal
// "who was there" memory aid. Sending a moment to a person lives in the share
// sheet, not here — the friend-chip mode was removed with the tagging system.
interface Props {
  people: string[];
  onChangePeople: (people: string[]) => void;
}

export function PeopleInput({ people, onChangePeople }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const addTextChip = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!people.includes(trimmed)) {
      onChangePeople([...people, trimmed]);
      Haptics.selectionAsync();
    }
    setQuery("");
  };

  const showDropdown = focused && query.trim().length > 0;

  return (
    <View>
      {people.length > 0 && (
        <View style={styles.chips}>
          {people.map((name) => (
            <View key={name} style={[styles.chip, { backgroundColor: theme.colors.chipBg }]}>
              <Text style={[styles.chipText, { color: theme.colors.chipText }]} numberOfLines={1}>
                {name}
              </Text>
              <TouchableOpacity onPress={() => onChangePeople(people.filter((p) => p !== name))} hitSlop={6}>
                <Ionicons name="close" size={13} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TextInput
        ref={inputRef}
        style={[styles.input, focused && { borderColor: theme.colors.accent }]}
        placeholder="Add people…"
        placeholderTextColor={theme.colors.placeholder}
        cursorColor={theme.colors.accent}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); addTextChip(); }}
        onSubmitEditing={addTextChip}
      />

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: theme.colors.backgroundSecondary, borderColor: theme.colors.border }]}>
          <TouchableOpacity style={styles.dropdownRow} onPress={addTextChip} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={[styles.dropdownAdd, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              Add "{query.trim()}"
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.radii.lg,
      gap: 5,
      maxWidth: 200,
    },
    chipText: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      flexShrink: 1,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    dropdown: {
      marginTop: theme.spacing.xs,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    dropdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 11,
    },
    dropdownAdd: {
      fontSize: theme.fontSize.sm,
      flexShrink: 1,
    },
  });
}
