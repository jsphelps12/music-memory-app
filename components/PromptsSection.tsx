import { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/hooks/useTheme";
import { confirmSheet } from "@/components/ConfirmSheet";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { SectionLabel } from "@/components/SectionLabel";
import { IconButton } from "@/components/IconButton";
import { Theme } from "@/constants/theme";
import { PROMPT_CATEGORIES } from "@/constants/Prompts";
import { CustomPromptCategory } from "@/types";
import { friendlyError } from "@/lib/errors";

const MAX_CUSTOM_CATEGORIES = 3;
const MAX_STARTERS = 5;

interface Props {
  customCategories: CustomPromptCategory[];
  onSave: (category: CustomPromptCategory) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// Prompt categories inside Settings: preset and custom categories as
// hairline rows that expand to show their starters, and an inline editor
// for the custom ones.
export function PromptsSection({ customCategories, onSave, onDelete }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [expandedCustom, setExpandedCustom] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<CustomPromptCategory | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = (cat: CustomPromptCategory | null) => {
    setFormError("");
    setEditingCategory(cat);
  };

  const handleAddCategory = () => {
    if (customCategories.length >= MAX_CUSTOM_CATEGORIES) return;
    startEditing({ id: Crypto.randomUUID(), label: "", starters: [""] });
  };

  const handleEdit = (cat: CustomPromptCategory) => {
    startEditing({ ...cat, starters: [...cat.starters] });
  };

  const handleDelete = async (cat: CustomPromptCategory) => {
    const confirmed = await confirmSheet({
      title: `Delete "${cat.label}"?`,
      message: "This category and all its starters will be removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await onDelete(cat.id);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't delete category", friendlyError(e));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || saving) return;
    const label = editingCategory.label.trim();
    if (!label) {
      setFormError("Give the category a name.");
      return;
    }
    const starters = editingCategory.starters.map((s) => s.trim()).filter(Boolean);
    if (starters.length === 0) {
      setFormError("Add at least one starter.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await onSave({ ...editingCategory, label, starters });
    } catch (e) {
      // Keep the editor open so nothing typed is lost.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFormError(friendlyError(e));
      return;
    } finally {
      setSaving(false);
    }
    setEditingCategory(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const updateLabel = (label: string) => {
    if (!editingCategory) return;
    if (formError) setFormError("");
    setEditingCategory({ ...editingCategory, label });
  };

  const updateStarter = (index: number, text: string) => {
    if (!editingCategory) return;
    if (formError) setFormError("");
    const starters = [...editingCategory.starters];
    starters[index] = text;
    setEditingCategory({ ...editingCategory, starters });
  };

  const addStarterField = () => {
    if (!editingCategory || editingCategory.starters.length >= MAX_STARTERS) return;
    setEditingCategory({ ...editingCategory, starters: [...editingCategory.starters, ""] });
  };

  const removeStarter = (index: number) => {
    if (!editingCategory) return;
    const starters = editingCategory.starters.filter((_, i) => i !== index);
    setEditingCategory({ ...editingCategory, starters: starters.length ? starters : [""] });
  };

  // ── Edit form ──────────────────────────────────────────────
  if (editingCategory) {
    const isExisting = !!customCategories.find((c) => c.id === editingCategory.id);
    return (
      <View style={styles.editor}>
        <View style={styles.editHeader}>
          <Button
            label="Cancel"
            variant="text"
            tone="secondary"
            onPress={() => startEditing(null)}
          />
          <Text style={styles.editTitle}>{isExisting ? "Edit category" : "New category"}</Text>
          <Button label="Save" size="pill" onPress={handleSaveEdit} loading={saving} />
        </View>

        <TextField
          placeholder="Category name, like Travel"
          value={editingCategory.label}
          onChangeText={updateLabel}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={30}
        />

        <SectionLabel style={styles.startersLabel}>Starters</SectionLabel>
        {editingCategory.starters.map((s, i) => (
          <View key={i} style={styles.starterRow}>
            <TextField
              placeholder={`Starter ${i + 1}`}
              value={s}
              onChangeText={(t) => updateStarter(i, t)}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
              containerStyle={styles.starterField}
            />
            <IconButton
              name="close"
              size={18}
              color={theme.colors.textSecondary}
              onPress={() => removeStarter(i)}
              accessibilityLabel={`Remove starter ${i + 1}`}
            />
          </View>
        ))}

        {editingCategory.starters.length < MAX_STARTERS && (
          <Button label="Add starter" icon="add" variant="text" onPress={addStarterField} />
        )}

        {formError ? (
          <Text style={styles.formError} accessibilityRole="alert">
            {formError}
          </Text>
        ) : null}
      </View>
    );
  }

  // ── Main view ──────────────────────────────────────────────
  return (
    <View>
      <SectionLabel style={styles.groupLabel}>Preset</SectionLabel>
      <View style={styles.list}>
        {PROMPT_CATEGORIES.map((cat) => {
          const isExpanded = expandedPreset === cat.label;
          return (
            <View key={cat.label} style={styles.categoryBlock}>
              <Pressable
                style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}
                onPress={() => setExpandedPreset(isExpanded ? null : cat.label)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
              >
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
              {isExpanded && (
                <View style={styles.startersList}>
                  {cat.prompts.map((p) => (
                    <Text key={p.starter} style={styles.starterPreview}>{p.starter}</Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <SectionLabel
        style={styles.groupLabel}
        meta={`${customCategories.length} of ${MAX_CUSTOM_CATEGORIES}`}
        right={
          customCategories.length < MAX_CUSTOM_CATEGORIES ? (
            <Button label="Add" icon="add" variant="text" onPress={handleAddCategory} />
          ) : undefined
        }
      >
        Your categories
      </SectionLabel>

      {customCategories.length === 0 ? (
        <Text style={styles.emptyText}>
          Add up to {MAX_CUSTOM_CATEGORIES} categories with your own starters.
        </Text>
      ) : (
        <View style={styles.list}>
          {customCategories.map((cat) => {
            const isExpanded = expandedCustom === cat.id;
            return (
              <View key={cat.id} style={styles.categoryBlock}>
                <Pressable
                  style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}
                  onPress={() => setExpandedCustom(isExpanded ? null : cat.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                >
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
                {isExpanded && (
                  <View style={styles.startersList}>
                    {cat.starters.map((s, i) => (
                      <Text key={i} style={styles.starterPreview}>{s}</Text>
                    ))}
                    <View style={styles.customActions}>
                      <Button label="Edit" variant="text" size="pill" onPress={() => handleEdit(cat)} />
                      <Button
                        label="Delete"
                        variant="text"
                        size="pill"
                        tone="destructive"
                        onPress={() => handleDelete(cat)}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    groupLabel: {
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.xs,
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    categoryBlock: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      gap: theme.spacing.sm,
    },
    categoryLabel: {
      ...theme.typography.body,
      color: theme.colors.text,
      flex: 1,
    },
    customActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginLeft: -theme.spacing.xs,
    },
    startersList: {
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    starterPreview: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    emptyText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    // Edit form
    editor: {
      paddingTop: theme.spacing.sm,
    },
    editHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.md,
    },
    editTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
    },
    startersLabel: {
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.xs,
    },
    starterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    starterField: {
      flex: 1,
    },
    formError: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      marginTop: theme.spacing.sm,
    },
  });
}
