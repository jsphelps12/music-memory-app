import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { PROMPT_CATEGORIES } from "@/constants/Prompts";
import { CustomPromptCategory } from "@/types";
import { BottomSheet } from "@/components/BottomSheet";

interface Props {
  visible: boolean;
  onSelect: (prompt: string) => void;
  onClose: () => void;
  customCategories?: CustomPromptCategory[];
}

export function PromptPickerModal({ visible, onSelect, onClose, customCategories = [] }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedCategory, setSelectedCategory] = useState(0);

  const allCategories = [
    ...PROMPT_CATEGORIES,
    ...customCategories.map((c) => ({
      label: c.label,
      prompts: c.starters.map((s) => ({ question: s, starter: s })),
    })),
  ];
  const category = allCategories[selectedCategory] ?? allCategories[0];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Need a nudge?"
      minHeight="55%"
      maxHeight="65%"
    >
      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={{ flexShrink: 0, flexGrow: 0 }}
      >
        {allCategories.map((cat, i) => (
          <TouchableOpacity
            key={cat.label}
            style={[styles.tab, i === selectedCategory && styles.tabActive]}
            onPress={() => setSelectedCategory(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, i === selectedCategory && styles.tabTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Prompts */}
      <ScrollView style={styles.promptsScroll} contentContainerStyle={styles.prompts}>
        {category.prompts.map((prompt) => (
          <TouchableOpacity
            key={prompt.question}
            style={styles.promptRow}
            onPress={() => {
              onSelect(prompt.starter);
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.promptText}>{prompt.question}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    promptsScroll: {
      flex: 1,
    },
    tabs: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: 24,
      paddingBottom: 0,
    },
    tab: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
      borderRadius: theme.spacing.lg,
      backgroundColor: theme.colors.backgroundInput,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    tabText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.bodyMedium,
    },
    tabTextActive: {
      color: theme.colors.chipSelectedText,
    },
    prompts: {
      paddingHorizontal: 24,
      paddingTop: 4,
      gap: 2,
    },
    promptRow: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    promptText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      lineHeight: 22,
    },
  });
}
