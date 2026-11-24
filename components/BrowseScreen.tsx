import { ReactNode, useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Chip } from "@/components/Chip";
import { MomentCard } from "@/components/MomentCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { pluralMoments } from "@/lib/utils";
import { artworkUrlAtSize } from "@/lib/itunes";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { Moment } from "@/types";

// The Chip draws its image at 20pt; ask for 3x.
const CHIP_ARTWORK_PX = 60;

export interface BrowseSwitcherItem {
  key: string;
  label: string;
  /** Album drill-down only: the album's cover, drawn small in its chip. */
  artworkUrl?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  items: BrowseSwitcherItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  moments: Moment[];
  isLoading: boolean;
  /**
   * A friendly message when the moments query failed. Shown in place of the
   * list (or as a banner over moments still on screen), so the switcher stays
   * usable and the user can hop to a sibling or retry.
   */
  error?: string | null;
  onRetry?: () => void;
  /**
   * Replaces the moment count under the title (person: "8 moments together ·
   * since March 2024"). Hidden while loading, like the count.
   */
  summary?: string;
  /**
   * Drawn above the moments and scrolls with them (person: the soundtrack
   * header). The caller decides when there's something to show.
   */
  header?: ReactNode;
}

/**
 * The shared layout for the Rediscover drill-downs (app/browse/*): a mood,
 * person, year or album. Phase 1 (2026-10): Journal rows instead of carded
 * rows, one pill switcher to hop between siblings, and no "When" bar.
 */
export function BrowseScreen({
  title,
  subtitle,
  items,
  activeKey,
  onSelect,
  moments,
  isLoading,
  error,
  onRetry,
  summary,
  header,
}: Props) {
  const { profile } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  // Lead the switcher with what you came in on, so it's never scrolled off
  // the edge; the order then holds still while you hop between siblings.
  const [leadKey] = useState(activeKey);
  const ordered = useMemo(() => {
    const lead = items.find((i) => i.key === leadKey);
    return lead ? [lead, ...items.filter((i) => i.key !== leadKey)] : items;
  }, [items, leadKey]);

  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const showBanner = !!error && moments.length > 0 && dismissedError !== error;

  const renderMoment = useCallback(
    ({ item }: { item: Moment }) => <MomentCard item={item} allMoods={allMoods} />,
    [allMoods]
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={title}
        subtitle={
          [subtitle, isLoading || (error && moments.length === 0) ? null : (summary ?? pluralMoments(moments.length))]
            .filter(Boolean)
            .join(" · ") || " "
        }
      />

      {items.length > 1 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.switcher}
          contentContainerStyle={styles.switcherContent}
          data={ordered}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              variant="filled"
              imageUri={item.artworkUrl ? artworkUrlAtSize(item.artworkUrl, CHIP_ARTWORK_PX) : undefined}
              selected={item.key === activeKey}
              onPress={() => onSelect(item.key)}
            />
          )}
        />
      )}

      <FlatList
        key={activeKey}
        data={moments}
        keyExtractor={(m) => m.id}
        renderItem={renderMoment}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          showBanner || header ? (
            <>
              {showBanner ? (
                <ErrorBanner message={error!} onRetry={onRetry} onDismiss={() => setDismissedError(error!)} />
              ) : null}
              {header}
            </>
          ) : undefined
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={styles.empty} color={theme.colors.textSecondary} />
          ) : error ? (
            <View style={styles.empty}>
              <ErrorState message={error} onRetry={onRetry} />
            </View>
          ) : (
            <Text style={[styles.empty, styles.emptyText]}>Nothing here yet</Text>
          )
        }
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    switcher: {
      flexGrow: 0,
    },
    switcherContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    list: {
      paddingHorizontal: theme.spacing.xl,
    },
    empty: {
      marginTop: 40,
    },
    emptyText: {
      ...theme.typography.body,
      textAlign: "center",
      color: theme.colors.textSecondary,
    },
  });
}
