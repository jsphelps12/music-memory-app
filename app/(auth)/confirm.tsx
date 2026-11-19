import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";
import { ALREADY_CONFIRMED_MESSAGE, confirmFailure } from "@/lib/confirmOutcome";

export default function ConfirmScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [error, setError] = useState("");
  // The email is confirmed but this device couldn't sign in with the link
  // (lib/confirmOutcome.ts): point to sign-in, not to signing up again.
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false);

  useEffect(() => {
    if (!code) {
      setError("Missing confirmation code. Try clicking the link in your email again.");
      return;
    }
    const showFailure = (err: unknown) => {
      const failure = confirmFailure(err);
      if (failure.kind === "already_confirmed") {
        setAlreadyConfirmed(true);
        setError(ALREADY_CONFIRMED_MESSAGE);
      } else {
        setError(failure.message);
      }
    };
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: err }) => {
        if (err) showFailure(err);
        // On success: AuthGate detects the new session and navigates to /(tabs) automatically.
      })
      // A non-auth error is thrown, not returned; it used to leave the spinner up.
      .catch(showFailure);
  }, [code]);

  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          {/* The failed state used to be a dead end with no way out. */}
          <Button
            label={alreadyConfirmed ? "Sign in" : "Back to sign in"}
            variant={alreadyConfirmed ? "primary" : "text"}
            onPress={() => router.replace("/(auth)/sign-in")}
            align="center"
            style={styles.back}
          />
        </>
      ) : (
        <ActivityIndicator color={theme.colors.textSecondary} />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["3xl"],
    },
    error: {
      ...theme.typography.body,
      lineHeight: 24,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    back: {
      marginTop: theme.spacing.lg,
    },
  });
}
