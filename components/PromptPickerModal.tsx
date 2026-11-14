import { useMemo, useState } from "react";
import { Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Chip } from "@/components/Chip";
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
      {/* Categories: ink chips, the same choice control as moods. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsScroll}
      >
        {allCategories.map((cat, i) => (
          <Chip
            key={cat.label}
            label={cat.label}
            selected={i === selectedCategory}
            onPress={() => setSelectedCategory(i)}
          />
        ))}
      </ScrollView>

      {/* Prompts */}
      <ScrollView style={styles.promptsScroll} contentContainerStyle={styles.prompts}>
        {category.prompts.map((prompt) => (
          <Pressable
            key={prompt.question}
            style={({ pressed }) => [styles.promptRow, pressed && styles.pressed]}
            onPress={() => {
              onSelect(prompt.starter);
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.promptText}>{prompt.question}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    tabsScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    tabs: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.sm,
    },
    promptsScroll: {
      flex: 1,
    },
    prompts: {
      paddingHorizontal: theme.spacing.xl,
    },
    promptRow: {
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    pressed: { opacity: 0.6 },
    promptText: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
  });
}
