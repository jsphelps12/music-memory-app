import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

export default function ConfirmScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) {
      setError("Missing confirmation code. Try clicking the link in your email again.");
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
      if (err) {
        setError("Confirmation failed. The link may have expired — try signing up again.");
      }
      // On success: AuthGate detects the new session and navigates to /(tabs) automatically.
    });
  }, [code]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {error ? (
        <Text style={[styles.error, { color: theme.colors.textSecondary }]}>{error}</Text>
      ) : (
        <ActivityIndicator color={theme.colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 16, textAlign: "center", paddingHorizontal: 32, lineHeight: 24 },
});
