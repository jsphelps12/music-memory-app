import { useMemo } from "react";
import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

export default function NotFoundScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
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
      padding: 20,
      backgroundColor: theme.colors.background,
    },
    title: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.text,
    },
    link: {
      marginTop: 15,
      paddingVertical: 15,
    },
    linkText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.accent,
    },
  });
}
