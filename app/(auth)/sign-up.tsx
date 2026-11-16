import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { usePostHog } from "posthog-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Link } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!email.trim() || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please enter both email and password.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      posthog.capture("signed_up", { method: "email" });
      router.replace("/(auth)/sign-in?registered=1");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      {/* Centered, but never under the status bar: with the keyboard up the
          form rises, and without a top inset it slid under the clock. */}
      <View style={[styles.inner, { paddingTop: insets.top + theme.spacing.xl }]}>
        <Text style={styles.title} accessibilityRole="header">Sign up</Text>
        <Text style={styles.subtitle}>Create your Soundtracks account</Text>

        <TextField
          containerStyle={styles.field}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />

        <TextField
          containerStyle={styles.field}
          placeholder="Password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={handleSignUp}
          value={password}
          onChangeText={setPassword}
          trailing={
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Icon
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          }
        />

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Button label="Create account" onPress={handleSignUp} loading={loading} style={styles.button} />

        <Link href="/(auth)/sign-in" replace asChild>
          <TouchableOpacity style={styles.linkContainer} accessibilityRole="link">
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    inner: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing["2xl"],
    },
    title: {
      ...theme.typography.headline,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    subtitle: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["3xl"],
    },
    field: {
      marginBottom: theme.spacing.md,
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.destructive,
      marginBottom: theme.spacing.md,
    },
    button: {
      marginTop: theme.spacing.xs,
    },
    linkContainer: {
      marginTop: theme.spacing["2xl"],
      alignItems: "center",
      minHeight: 44,
      justifyContent: "center",
    },
    linkText: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    linkBold: {
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
  });
}
