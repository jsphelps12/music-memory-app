import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  people: string[];
  onChange: (people: string[]) => void;
}

export function PeopleInput({ people, onChange }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const handleAdd = () => {
    const names = input
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !people.includes(n));
    if (names.length > 0) onChange([...people, ...names]);
    setInput("");
  };

  return (
    <View>
      <TextInput
        style={[styles.input, focused && { borderColor: theme.colors.accent }]}
        placeholder="Add people (comma-separated)"
        placeholderTextColor={theme.colors.placeholder}
        cursorColor={theme.colors.accent}
        value={input}
        onChangeText={setInput}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          handleAdd();
        }}
        onSubmitEditing={handleAdd}
        returnKeyType="done"
      />
      {people.length > 0 && (
        <View style={styles.tags}>
          {people.map((name) => (
            <View key={name} style={styles.tag}>
              <Text style={styles.tagText}>{name}</Text>
              <TouchableOpacity
                onPress={() => onChange(people.filter((p) => p !== name))}
              >
                <Text style={styles.tagRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.chipBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      gap: 6,
    },
    tagText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    tagRemove: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textTertiary,
    },
  });
}
