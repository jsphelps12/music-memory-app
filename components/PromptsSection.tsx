import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { PROMPT_CATEGORIES } from "@/constants/Prompts";
import { CustomPromptCategory } from "@/types";

const MAX_CUSTOM_CATEGORIES = 3;
const MAX_STARTERS = 5;

interface Props {
  customCategories: CustomPromptCategory[];
  onSave: (category: CustomPromptCategory) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PromptsSection({ customCategories, onSave, onDelete }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [expandedCustom, setExpandedCustom] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<CustomPromptCategory | null>(null);

  const handleAddCategory = () => {
    if (customCategories.length >= MAX_CUSTOM_CATEGORIES) return;
    const blank: CustomPromptCategory = {
      id: Crypto.randomUUID(),
      label: "",
      starters: [""],
    };
    setEditingCategory(blank);
  };

  const handleEdit = (cat: CustomPromptCategory) => {
    setEditingCategory({ ...cat, starters: [...cat.starters] });
  };

  const handleDelete = (cat: CustomPromptCategory) => {
    Alert.alert(
      `Delete "${cat.label}"?`,
      "This category and all its starters will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(cat.id),
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!editingCategory) return;
    const label = editingCategory.label.trim();
    if (!label) {
      Alert.alert("Category name required");
      return;
    }
    const starters = editingCategory.starters.map((s) => s.trim()).filter(Boolean);
    if (starters.length === 0) {
      Alert.alert("Add at least one starter");
      return;
    }
    await onSave({ ...editingCategory, label, starters });
    setEditingCategory(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const updateStarter = (index: number, text: string) => {
    if (!editingCategory) return;
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
    return (
      <View>
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={() => setEditingCategory(null)} activeOpacity={0.7}>
            <Text style={[styles.editAction, { color: theme.colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.editTitle}>
            {customCategories.find((c) => c.id === editingCategory.id) ? "Edit Category" : "New Category"}
          </Text>
          <TouchableOpacity onPress={handleSaveEdit} activeOpacity={0.7}>
            <Text style={[styles.editAction, { color: theme.colors.accent }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.categoryNameInput}
          placeholder="Category name (e.g. Travel)"
          placeholderTextColor={theme.colors.placeholder}
          value={editingCategory.label}
          onChangeText={(t) => setEditingCategory({ ...editingCategory, label: t })}
          maxLength={30}
        />

        <Text style={styles.startersLabel}>Starters</Text>
        {editingCategory.starters.map((s, i) => (
          <View key={i} style={styles.starterRow}>
            <TextInput
              style={styles.starterInput}
              placeholder={`Starter ${i + 1}...`}
              placeholderTextColor={theme.colors.placeholder}
              value={s}
              onChangeText={(t) => updateStarter(i, t)}
            />
            <TouchableOpacity onPress={() => removeStarter(i)} activeOpacity={0.7}>
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {editingCategory.starters.length < MAX_STARTERS && (
          <TouchableOpacity style={styles.addStarterBtn} onPress={addStarterField} activeOpacity={0.7}>
            <Text style={styles.addStarterText}>+ Add starter</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Main view ──────────────────────────────────────────────
  return (
    <View>
      {/* Preset categories */}
      <Text style={styles.groupLabel}>Preset</Text>
      {PROMPT_CATEGORIES.map((cat) => {
        const isExpanded = expandedPreset === cat.label;
        return (
          <View key={cat.label} style={styles.categoryBlock}>
            <TouchableOpacity
              style={styles.categoryRow}
              activeOpacity={0.7}
              onPress={() => setExpandedPreset(isExpanded ? null : cat.label)}
            >
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.chevron}>{isExpanded ? "▲" : "▼"}</Text>
            </TouchableOpacity>
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

      {/* Custom categories */}
      <View style={styles.customHeader}>
        <Text style={styles.groupLabel}>Your Categories</Text>
        {customCategories.length < MAX_CUSTOM_CATEGORIES && (
          <TouchableOpacity onPress={handleAddCategory} activeOpacity={0.7}>
            <Text style={styles.addCategoryBtn}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {customCategories.length === 0 && (
        <Text style={styles.emptyText}>
          Add up to 3 categories with your own starters.
        </Text>
      )}

      {customCategories.map((cat) => {
        const isExpanded = expandedCustom === cat.id;
        return (
          <View key={cat.id} style={styles.categoryBlock}>
            <TouchableOpacity
              style={styles.categoryRow}
              activeOpacity={0.7}
              onPress={() => setExpandedCustom(isExpanded ? null : cat.id)}
            >
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <View style={styles.customActions}>
                <TouchableOpacity onPress={() => handleEdit(cat)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.editBtn}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(cat)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.deleteBtn}>Delete</Text>
                </TouchableOpacity>
                <Text style={styles.chevron}>{isExpanded ? "▲" : "▼"}</Text>
              </View>
            </TouchableOpacity>
            {isExpanded && (
              <View style={styles.startersList}>
                {cat.starters.map((s, i) => (
                  <Text key={i} style={styles.starterPreview}>{s}</Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    groupLabel: {
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: theme.spacing.sm,
      marginTop: theme.spacing.lg,
    },
    categoryBlock: {
      marginBottom: theme.spacing.xs,
      borderRadius: 10,
      backgroundColor: theme.colors.backgroundInput,
      overflow: "hidden",
    },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 12,
    },
    categoryLabel: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      fontWeight: theme.fontWeight.medium,
      flex: 1,
    },
    chevron: {
      fontSize: 11,
      color: theme.colors.textTertiary,
      marginLeft: theme.spacing.sm,
    },
    customActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    editBtn: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
    deleteBtn: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.error ?? "#E05C5C",
    },
    startersList: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: 12,
      gap: 8,
    },
    starterPreview: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    customHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    addCategoryBtn: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
      fontWeight: theme.fontWeight.medium,
      marginTop: theme.spacing.lg,
    },
    emptyText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing.xs,
    },
    // Edit form
    editHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.lg,
    },
    editTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    editAction: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
    },
    categoryNameInput: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.md,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
      marginBottom: theme.spacing.lg,
    },
    startersLabel: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    starterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    starterInput: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.md,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      backgroundColor: theme.colors.backgroundInput,
    },
    removeBtn: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
      paddingHorizontal: 4,
    },
    addStarterBtn: {
      marginTop: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    addStarterText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
  });
}
