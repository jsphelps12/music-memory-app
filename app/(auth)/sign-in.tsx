import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as AppleAuthentication from "expo-apple-authentication";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";

export default function SignInScreen() {
  const { signIn, signInWithApple } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState("");
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Welcome to Tracks</Text>

        {registered ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successMessage}>
              We sent a confirmation link to your email. Tap it to verify your
              account, then come back here and sign in.{"\n\n"}Don't worry if the
              link shows an error page — your account will still be confirmed.
            </Text>
          </View>
        ) : null}

        <TextInput
          style={[styles.input, focusedField === "email" && { borderColor: theme.colors.accent }]}
          placeholder="Email"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField("email")}
          onBlur={() => setFocusedField("")}
        />

        <TextInput
          style={[styles.input, focusedField === "password" && { borderColor: theme.colors.accent }]}
          placeholder="Password"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField("password")}
          onBlur={() => setFocusedField("")}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

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
              cornerRadius={10}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </>
        )}

        <Link href="/(auth)/sign-up" asChild>
          <TouchableOpacity style={styles.linkContainer}>
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
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
      fontSize: theme.fontSize["3xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.xs,
    },
    subtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing["3xl"],
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      paddingHorizontal: theme.spacing.lg,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      marginBottom: 14,
      backgroundColor: theme.colors.backgroundInput,
    },
    successBox: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: 10,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    successTitle: {
      color: theme.colors.success,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      marginBottom: theme.spacing.xs,
    },
    successMessage: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
    },
    error: {
      color: theme.colors.destructive,
      fontSize: theme.fontSize.sm,
      marginBottom: 14,
    },
    button: {
      height: 48,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing.xs,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: theme.colors.buttonText,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
    },
    linkContainer: {
      marginTop: theme.spacing["2xl"],
      alignItems: "center",
    },
    linkText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    linkBold: {
      fontWeight: theme.fontWeight.semibold,
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
      backgroundColor: theme.colors.border,
    },
    dividerText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      marginHorizontal: theme.spacing.md,
    },
    appleButton: {
      height: 48,
      width: "100%",
    },
  });
}
