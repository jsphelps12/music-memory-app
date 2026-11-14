import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "posthog-react-native";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";

export default function SignInScreen() {
  const { signIn, signInWithApple } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const posthog = usePostHog();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    setLoading(true);
    try {
      await signInWithApple();
      posthog.capture("signed_in", { method: "apple" });
    } catch (e: any) {
      const message = friendlyError(e);
      if (message) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!email.trim() || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Please enter both email and password.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      posthog.capture("signed_in", { method: "email" });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <View style={styles.inner}>
        <Text style={styles.title} accessibilityRole="header">Sign in</Text>
        <Text style={styles.subtitle}>Welcome to Soundtracks</Text>

        {registered ? (
          <View style={styles.successBox}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} />
            <View style={styles.successText}>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successMessage}>
                We sent a confirmation link to your email. Tap it to verify your
                account, then come back here and sign in.{"\n\n"}If the link
                shows an error page, don&apos;t worry: your account is still confirmed.
              </Text>
            </View>
          </View>
        ) : null}

        <TextField
          testID="signin-email"
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
          testID="signin-password"
          containerStyle={styles.field}
          placeholder="Password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          value={password}
          onChangeText={setPassword}
          trailing={
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          }
        />

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Button
          testID="signin-submit"
          label="Sign in"
          onPress={handleSignIn}
          loading={loading}
          style={styles.button}
        />

        {appleAvailable && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                theme.isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={theme.radii.button}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </>
        )}

        <Link href="/(auth)/sign-up" replace asChild>
          <TouchableOpacity style={styles.linkContainer}>
            <Text style={styles.linkText}>
              Don&apos;t have an account? <Text style={styles.linkBold}>Sign up</Text>
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
    successBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    successText: {
      flex: 1,
    },
    successTitle: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    successMessage: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
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
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.xl,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.divider,
    },
    dividerText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginHorizontal: theme.spacing.md,
    },
    appleButton: {
      height: 52,
      width: "100%",
    },
  });
}
