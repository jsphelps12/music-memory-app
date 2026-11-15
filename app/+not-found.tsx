import { useMemo } from "react";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Button } from "@/components/Button";

export default function NotFoundScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This page doesn&apos;t exist</Text>
        <Text style={styles.body}>The link may be old, or the page has moved.</Text>
        <Button
          label="Go to your journal"
          onPress={() => router.replace("/")}
          fullWidth={false}
          align="center"
          style={styles.button}
        />
      </View>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    title: {
      ...theme.typography.title,
      color: theme.colors.text,
      textAlign: "center",
    },
    body: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.sm,
    },
    button: {
      marginTop: theme.spacing.xl,
    },
  });
}
