import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppImage } from "@/components/AppImage";
import { getPublicPhotoUrl } from "@/lib/storage";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

interface Props {
  /** The stored avatar path from the profile row (never rebuilt). */
  path: string | null | undefined;
  /** Used for the initial when there's no photo. */
  name: string | null | undefined;
  /** 32 in a sheet's rows, 40 on a screen's list. */
  size?: 32 | 40;
}

/**
 * A person's round photo, or their initial on Tertiary paper (DESIGN.md,
 * Components). The person pickers, the friends list and album members all
 * use it, so a person looks the same everywhere. Decorative: the row it sits
 * in carries the name for VoiceOver.
 */
export function Avatar({ path, name, size = 32 }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initial = (name ?? "").trim().replace(/^@/, "")[0]?.toLocaleUpperCase() ?? "?";
  return (
    <View
      style={[styles.disc, size === 40 ? styles.large : styles.small]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {path ? (
        <AppImage source={{ uri: getPublicPhotoUrl(path) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[styles.initial, size === 40 && styles.initialLarge]} allowFontScaling={false}>
          {initial}
        </Text>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    disc: {
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: theme.colors.backgroundTertiary,
    },
    small: { width: 32, height: 32, borderRadius: 16 },
    large: { width: 40, height: 40, borderRadius: 20 },
    initial: {
      fontFamily: theme.fonts.bodySemibold,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    initialLarge: {
      ...theme.typography.bodyStrong,
      color: theme.colors.textSecondary,
    },
  });
}
