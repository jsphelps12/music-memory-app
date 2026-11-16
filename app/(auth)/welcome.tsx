import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AppImage } from "@/components/AppImage";
import * as Haptics from "expo-haptics";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/Button";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICON = require("@/assets/images/app-icon.png");

const FEATURES = [
  {
    icon: "musical-notes-outline" as const,
    text: "Search and save the songs that matter",
  },
  {
    icon: "journal-outline" as const,
    text: "Write reflections tied to each song",
  },
  {
    icon: "time-outline" as const,
    text: "Build a timeline of musical memories",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { signInWithApple } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    try {
      await signInWithApple();
    } catch (e: any) {
      const message = friendlyError(e);
      if (message) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(message);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <AppImage source={ICON} style={styles.icon} contentFit="contain" />

        <Text style={styles.title}>Soundtracks</Text>
        <Text style={styles.tagline}>
          Capture the songs behind your memories
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.featureRow}>
              <Icon
                name={feature.icon}
                size={22}
                color={theme.colors.textSecondary}
                style={styles.featureIcon}
              />
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + theme.spacing.xl }]}>
        {appleAvailable && (
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
        )}

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Button label="Get started" onPress={() => router.replace("/(auth)/sign-up")} />

        <TouchableOpacity
          onPress={() => router.replace("/(auth)/sign-in")}
          activeOpacity={0.7}
          style={styles.linkContainer}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["2xl"],
    },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    icon: {
      width: 100,
      height: 100,
      borderRadius: theme.radii.lg + 2,
      marginBottom: theme.spacing["2xl"],
    },
    title: {
      ...theme.typography.headline,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    tagline: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing["4xl"],
    },
    features: {
      alignSelf: "stretch",
      gap: theme.spacing.xl,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    featureIcon: {
      width: 32,
    },
    featureText: {
      ...theme.typography.body,
      color: theme.colors.text,
      flex: 1,
    },
    bottom: {},
    appleButton: {
      height: 52,
      width: "100%",
      marginBottom: theme.spacing.md,
    },
    error: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      color: theme.colors.destructive,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    linkContainer: {
      marginTop: theme.spacing.lg,
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
