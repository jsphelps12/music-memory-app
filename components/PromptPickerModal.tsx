import { useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { PROMPT_CATEGORIES } from "@/constants/Prompts";

interface Props {
  visible: boolean;
  onSelect: (prompt: string) => void;
  onClose: () => void;
}

export function PromptPickerModal({ visible, onSelect, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const translateY = useSharedValue(0);

  const category = PROMPT_CATEGORIES[selectedCategory];

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 80) {
        runOnJS(onClose)();
      }
      translateY.value = withTiming(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, animatedStyle]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Need a nudge?</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {PROMPT_CATEGORIES.map((cat, i) => (
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
          <ScrollView contentContainerStyle={styles.prompts}>
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
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Platform.OS === "ios" ? 36 : 24,
      maxHeight: "65%",
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    title: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.text,
    },
    close: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
    },
    tabs: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      paddingHorizontal: 24,
      paddingBottom: 12,
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
      fontWeight: theme.fontWeight.medium,
    },
    tabTextActive: {
      color: "#fff",
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
