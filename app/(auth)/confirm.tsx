import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export default function ConfirmScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
    <View style={styles.container}>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ActivityIndicator color={theme.colors.textSecondary} />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
    error: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: theme.spacing["3xl"],
      lineHeight: 24,
    },
  });
}
