import { useMemo, useState } from "react";
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
import { router } from "expo-router";
import { Link } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      router.replace("/(auth)/sign-in?registered=1");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Sign Up</Text>
        <Text style={styles.subtitle}>Create your Music Memory account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.colors.placeholder}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.buttonText} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/sign-in" asChild>
          <TouchableOpacity style={styles.linkContainer}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign In</Text>
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
  });
}
