import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { IconButton } from "@/components/IconButton";
import { MomentCard } from "@/components/MomentCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { pluralMoments } from "@/lib/utils";
import { artworkUrlAtSize } from "@/lib/itunes";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";

// 22pt pill artwork at 3x.
const PILL_ARTWORK_PX = 66;
import type { Moment } from "@/types";

export interface BrowseSwitcherItem {
  key: string;
  label: string;
  /** Album drill-down only: a small cover in the pill. */
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
}

/**
 * The shared layout for the Rediscover drill-downs (app/browse/*): a mood,
 * person, year or album. Phase 1 (2026-10): Journal rows instead of carded
 * rows, one pill switcher to hop between siblings, and no "When" bar.
 */
export function BrowseScreen({ title, subtitle, items, activeKey, onSelect, moments, isLoading, error, onRetry }: Props) {
  const router = useRouter();
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <IconButton name="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
      </View>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {[subtitle, isLoading || (error && moments.length === 0) ? null : pluralMoments(moments.length)].filter(Boolean).join(" · ") || " "}
        </Text>
      </View>

      {items.length > 1 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.switcher}
          contentContainerStyle={styles.switcherContent}
          data={ordered}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const active = item.key === activeKey;
            return (
              <TouchableOpacity
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => onSelect(item.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {item.artworkUrl ? <AppImage source={{ uri: artworkUrlAtSize(item.artworkUrl, PILL_ARTWORK_PX) }} style={styles.pillArt} /> : null}
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
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
          showBanner ? (
            <ErrorBanner message={error!} onRetry={onRetry} onDismiss={() => setDismissedError(error!)} />
          ) : null
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
    topBar: {
      paddingHorizontal: theme.spacing.sm,
    },
    titleBlock: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    title: {
      marginTop: theme.spacing.xs,
      fontSize: theme.fontSize["3xl"],
      lineHeight: 38,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    switcher: {
      flexGrow: 0,
    },
    switcherContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    pill: {
      height: 34,
      maxWidth: 200,
      paddingHorizontal: 14,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.chipBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    pillActive: {
      backgroundColor: theme.colors.buttonBg,
    },
    pillArt: {
      width: 22,
      height: 22,
      borderRadius: 4,
      marginLeft: -6,
    },
    pillText: {
      flexShrink: 1,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.text,
    },
    pillTextActive: {
      color: theme.colors.buttonText,
    },
    list: {
      paddingHorizontal: theme.spacing.xl,
    },
    empty: {
      marginTop: 40,
    },
    emptyText: {
      textAlign: "center",
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
  });
}
