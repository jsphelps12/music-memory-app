import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppImage } from "@/components/AppImage";
import { ListRow } from "@/components/ListRow";
import { Icon, type IconName } from "@/components/Icon";
import type { ComingUpRow } from "@/lib/comingUp";
import { artworkUrlAtSize } from "@/lib/itunes";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

const ART = 40;

// Rediscover's rows lead with something; Insights' are text only.
const ICONS: Partial<Record<string, IconName>> = {
  rewind: "time-outline",
  year_review: "calendar-outline",
};

/**
 * A small journal's "coming up" rows (lib/comingUp.ts), the same on
 * Rediscover and Insights: what will show up and when, quiet (no tap) unless
 * the row is about a moment, which opens it.
 */
export function ComingUpRows({
  rows,
  onOpenMoment,
}: {
  rows: readonly ComingUpRow[];
  onOpenMoment?: (momentId: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <>
      {rows.map((row, i) => {
        const open = row.momentId && onOpenMoment ? () => onOpenMoment(row.momentId!) : undefined;
        return (
          <ListRow
            key={row.key}
            label={row.label}
            strong={!!row.momentId}
            subtitle={row.subtitle}
            detail={row.detail}
            leading={
              row.artworkUrl ? (
                <AppImage
                  source={{ uri: artworkUrlAtSize(row.artworkUrl, ART * 3) }}
                  style={styles.art}
                  contentFit="cover"
                />
              ) : ICONS[row.key] ? (
                // In an artwork-sized box, so every row's text lines up.
                <View style={styles.iconBox}>
                  <Icon name={ICONS[row.key]!} size={22} color={theme.colors.textSecondary} />
                </View>
              ) : undefined
            }
            onPress={open}
            accessibilityLabel={[row.label, row.subtitle, row.detail].filter(Boolean).join(", ")}
            last={i === rows.length - 1}
          />
        );
      })}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    art: {
      width: ART,
      height: ART,
      borderRadius: theme.radii.sm,
    },
    iconBox: {
      width: ART,
      height: ART,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
