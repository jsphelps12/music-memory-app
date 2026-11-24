import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SharedWithYouList } from "@/components/SharedWithYouList";

/**
 * Everything friends have sent you (Sharing v2 direct shares), as its own
 * screen. The Journal's Shared pane shows the same list; this route stays for
 * You's preview, notifications and links. Opening it marks everything it
 * shows as seen.
 */
export default function SharedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Shared with you" leading="back" />
      <SharedWithYouList active />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  });
}
