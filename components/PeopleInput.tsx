import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import type { TextInputInstance } from "react-native";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { Chip } from "@/components/Chip";
import { TextField } from "@/components/TextField";
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
  const inputRef = useRef<TextInputInstance>(null);

  // Return, blur and the "Add" row all commit what's typed, so a name is
  // never lost by closing the sheet.
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
            <Chip
              key={name}
              label={name}
              variant="filled"
              onRemove={() => onChangePeople(people.filter((p) => p !== name))}
            />
          ))}
        </View>
      )}

      <TextField
        ref={inputRef}
        icon="person-add-outline"
        placeholder="Add people"
        accessibilityLabel="Add a person"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          addTextChip();
        }}
        onSubmitEditing={addTextChip}
      />

      {showDropdown && (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={addTextChip}
          accessibilityRole="button"
        >
          <Icon name="add" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.rowText} numberOfLines={1}>
            Add &ldquo;{query.trim()}&rdquo;
          </Text>
        </Pressable>
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
      marginBottom: theme.spacing.md,
    },
    // A row on the sheet with a hairline under it, not a floating box.
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 48,
      marginTop: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    rowText: {
      ...theme.typography.body,
      color: theme.colors.text,
      flexShrink: 1,
    },
  });
}
