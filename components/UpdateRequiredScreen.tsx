import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

const APP_STORE_URL = "https://apps.apple.com/us/app/soundtracks/id6759203604";

// Shown instead of the app when the min-build gate trips (lib/minBuildGate.ts):
// this binary is older than the server's floor and the schema it expects may
// no longer exist. There is deliberately no dismiss — the whole point of the
// gate is a clean cutoff.
export function UpdateRequiredScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>time for an update</Text>
      <Text style={styles.body}>
        This version of Soundtracks is too old to keep your memories in sync.
        Update from the App Store and everything will be right where you left
        it.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => Linking.openURL(APP_STORE_URL).catch(() => {})}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Update Soundtracks</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing["2xl"],
    },
    title: {
      fontSize: 30,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    body: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 23,
      marginBottom: theme.spacing["3xl"],
    },
    button: {
      paddingVertical: 14,
      paddingHorizontal: theme.spacing["2xl"],
      borderRadius: theme.radii.button,
      backgroundColor: theme.colors.accent,
    },
    buttonText: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.bodySemibold,
      color: "#fff",
    },
  });
}
