import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { MOODS } from "@/constants/Moods";
import { CustomMoodDefinition } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";

interface Props {
  selectedMood: string | null;
  onSelectMood: (value: string | null) => void;
  customMoods: CustomMoodDefinition[];
  saveCustomMood: (mood: CustomMoodDefinition) => Promise<void>;
  deleteCustomMood: (value: string) => Promise<void>;
}

export function MoodSelector({
  selectedMood,
  onSelectMood,
  customMoods,
  saveCustomMood,
  deleteCustomMood,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmoji, setNewEmoji] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [formError, setFormError] = useState("");

  const handleSave = async () => {
    const emoji = newEmoji.trim();
    const label = newLabel.trim();
    if (!emoji || !label) return;
    try {
      const value = `custom_${Date.now()}`;
      await saveCustomMood({ value, label, emoji });
      onSelectMood(value);
      setShowAddForm(false);
      setNewEmoji("");
      setNewLabel("");
      setFormError("");
      Haptics.selectionAsync();
    } catch (e) {
      setFormError(friendlyError(e));
    }
  };

  const handleDelete = async (mood: CustomMoodDefinition) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await deleteCustomMood(mood.value);
      if (selectedMood === mood.value) onSelectMood(null);
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    }
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {[...MOODS, ...customMoods].map((mood) => {
          const isSelected = selectedMood === mood.value;
          const isCustom = mood.value.startsWith("custom_");
          return (
            <TouchableOpacity
              key={mood.value}
              style={[styles.chip, isSelected && styles.chipSelected]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.selectionAsync();
                onSelectMood(isSelected ? null : mood.value);
              }}
              onLongPress={
                isCustom
                  ? () => handleDelete(mood as CustomMoodDefinition)
                  : undefined
              }
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {mood.emoji} {mood.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={styles.chipAdd}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync();
            setShowAddForm((v) => !v);
          }}
        >
          <Text style={styles.chipAddText}>+ Add</Text>
        </TouchableOpacity>
      </ScrollView>

      {showAddForm && (
        <View style={styles.addForm}>
          <TextInput
            style={styles.emojiInput}
            placeholder="😊"
            placeholderTextColor={theme.colors.placeholder}
            value={newEmoji}
            onChangeText={setNewEmoji}
            maxLength={4}
          />
          <TextInput
            style={styles.labelInput}
            placeholder="Label"
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            value={newLabel}
            onChangeText={setNewLabel}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <TouchableOpacity
            style={styles.saveButton}
            activeOpacity={0.7}
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setShowAddForm(false);
              setNewEmoji("");
              setNewLabel("");
              setFormError("");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: {
      marginHorizontal: -theme.spacing.xl,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.chipBg,
    },
    chipSelected: {
      backgroundColor: theme.colors.chipSelectedBg,
    },
    chipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.chipText,
    },
    chipTextSelected: {
      color: theme.colors.chipSelectedText,
    },
    chipAdd: {
      paddingHorizontal: 14,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.chipBg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.colors.border,
    },
    chipAddText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    addForm: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    emojiInput: {
      width: 52,
      height: 44,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      fontSize: 22,
      textAlign: "center",
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    labelInput: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    saveButton: {
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 10,
      borderRadius: theme.radii.sm,
    },
    saveButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: "#fff",
    },
    cancelText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      paddingHorizontal: theme.spacing.xs,
    },
    error: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.destructive,
      marginTop: theme.spacing.xs,
    },
  });
}
