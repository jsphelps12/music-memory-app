import { useMemo } from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";

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
      <Text style={styles.title}>Time for an update</Text>
      <Text style={styles.body}>
        This version of Soundtracks is too old to keep your memories in sync.
        Update from the App Store and everything will be right where you left
        it.
      </Text>
      <Button
        label="Update Soundtracks"
        onPress={() => Linking.openURL(APP_STORE_URL).catch(() => {})}
      />
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
      ...theme.typography.headline,
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
    },
    body: {
      ...theme.typography.body,
      lineHeight: 23,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing["3xl"],
    },
  });
}
