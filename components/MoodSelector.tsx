import { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { MOODS } from "@/constants/Moods";
import { CustomMoodDefinition } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { ConfirmSheetHost, confirmSheet } from "@/components/ConfirmSheet";
import { Chip } from "@/components/Chip";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";

// Moods are words (DESIGN.md), so a custom mood is only a label. The data
// model still carries an emoji (only the share card shows it now); new custom
// moods get the note the app already falls back to for an unknown mood.
const CUSTOM_MOOD_EMOJI = "🎵";

interface Props {
  // Selection order is meaningful: the first mood is written to the legacy
  // single `mood` column for binaries <= build 22 (see lib/saveMoment.ts).
  selectedMoods: string[];
  onChangeMoods: (moods: string[]) => void;
  customMoods: CustomMoodDefinition[];
  saveCustomMood: (mood: CustomMoodDefinition) => Promise<void>;
  deleteCustomMood: (value: string) => Promise<void>;
}

export function MoodSelector({
  selectedMoods,
  onChangeMoods,
  customMoods,
  saveCustomMood,
  deleteCustomMood,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [formError, setFormError] = useState("");

  const closeForm = () => {
    setShowAddForm(false);
    setNewLabel("");
    setFormError("");
  };

  const handleSave = async () => {
    const label = newLabel.trim();
    if (!label) return;
    try {
      const value = `custom_${Date.now()}`;
      await saveCustomMood({ value, label, emoji: CUSTOM_MOOD_EMOJI });
      onChangeMoods([...selectedMoods, value]);
      closeForm();
      Haptics.selectionAsync();
    } catch (e) {
      setFormError(friendlyError(e));
    }
  };

  const handleDelete = async (mood: CustomMoodDefinition) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Removing a custom mood removes it from the profile, not just this
    // moment, so a long-press alone must not do it.
    const confirmed = await confirmSheet({
      title: `Delete "${mood.label}"?`,
      message: "It will be removed from your moods everywhere.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteCustomMood(mood.value);
      if (selectedMoods.includes(mood.value)) {
        onChangeMoods(selectedMoods.filter((v) => v !== mood.value));
      }
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
  };

  return (
    <View>
      {/* Words, wrapped (Phase 1, 2026-10): moods read as words everywhere,
          and wrapping shows every option at once instead of hiding half of
          them off the edge of a scroller. */}
      <View style={styles.wrap}>
        {[...MOODS, ...customMoods].map((mood) => {
          const isSelected = selectedMoods.includes(mood.value);
          const toggle = () => {
            Haptics.selectionAsync();
            onChangeMoods(
              isSelected
                ? selectedMoods.filter((v) => v !== mood.value)
                : [...selectedMoods, mood.value]
            );
          };
          if (!mood.value.startsWith("custom_")) {
            return <Chip key={mood.value} label={mood.label} selected={isSelected} onPress={toggle} />;
          }
          // Chip has no long-press, so a custom mood wraps a static Chip in
          // its own Pressable: tap toggles, hold offers to delete it.
          return (
            <Pressable
              key={mood.value}
              onPress={toggle}
              onLongPress={() => handleDelete(mood as CustomMoodDefinition)}
              accessibilityRole="button"
              accessibilityLabel={mood.label}
              accessibilityState={{ selected: isSelected }}
              accessibilityHint="Hold to delete this mood"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Chip label={mood.label} selected={isSelected} />
            </Pressable>
          );
        })}
        <Chip
          label="Add"
          icon="add"
          variant="add"
          onPress={() => {
            Haptics.selectionAsync();
            if (showAddForm) closeForm();
            else setShowAddForm(true);
          }}
        />
      </View>

      {showAddForm && (
        <View style={styles.addForm}>
          <TextField
            placeholder="A mood of your own"
            accessibilityLabel="New mood"
            value={newLabel}
            onChangeText={setNewLabel}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            maxLength={24}
            containerStyle={styles.addField}
          />
          <Button label="Save" size="pill" onPress={handleSave} disabled={!newLabel.trim()} style={styles.inRow} />
          <Button label="Cancel" variant="text" tone="secondary" size="pill" onPress={closeForm} style={styles.inRow} />
        </View>
      )}

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      {/* Own host: the capture screen shows this selector inside a
          BottomSheet, where the root host's Modal cannot present. */}
      <ConfirmSheetHost />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    pressed: { opacity: 0.7 },
    addForm: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    inRow: {
      alignSelf: "center",
    },
    addField: {
      flex: 1,
    },
    error: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
      marginTop: theme.spacing.sm,
    },
  });
}
