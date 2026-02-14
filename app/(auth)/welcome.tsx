import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

const ICON = require("@/assets/images/asset.webp");

const FEATURES = [
  {
    icon: "musical-notes" as const,
    text: "Search and save the songs that matter",
  },
  {
    icon: "journal" as const,
    text: "Write reflections tied to each song",
  },
  {
    icon: "time" as const,
    text: "Build a timeline of musical memories",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={ICON} style={styles.icon} contentFit="contain" />

        <Text style={styles.title}>Music Memory</Text>
        <Text style={styles.tagline}>
          Capture the songs behind your memories
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.featureRow}>
              <Ionicons
                name={feature.icon}
                size={22}
                color={theme.colors.accent}
                style={styles.featureIcon}
              />
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(auth)/sign-up")}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace("/(auth)/sign-in")}
          activeOpacity={0.7}
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkBold}>Sign In</Text>
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
      borderRadius: 22,
      marginBottom: theme.spacing["2xl"],
    },
    title: {
      fontSize: theme.fontSize["3xl"],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    tagline: {
      fontSize: theme.fontSize.base,
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
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      flex: 1,
    },
    bottom: {
      paddingBottom: 50,
    },
    button: {
      height: 48,
      backgroundColor: theme.colors.buttonBg,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
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
