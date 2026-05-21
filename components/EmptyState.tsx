import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, subtitle, action }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={theme.colors.textTertiary} />
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {action ? (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.colors.buttonBg }]}
          onPress={action.onPress}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnText, { color: theme.colors.buttonText }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    marginTop: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    marginTop: 20,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
  },
});
