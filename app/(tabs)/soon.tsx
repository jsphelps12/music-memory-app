import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

export default function SoonScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Ionicons name="sparkles-outline" size={48} color={theme.colors.textTertiary} />
      <Text style={[styles.title, { color: theme.colors.text }]}>Coming Soon</Text>
      <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
        Something new is on its way.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 24,
    fontFamily: "DMSerifDisplay_400Regular",
  },
  sub: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
