import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { ListRow } from "@/components/ListRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { MOODS } from "@/constants/Moods";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata } from "@/lib/browse";
import { friendlyError } from "@/lib/errors";
import { INSIGHTS_MIN_MOMENTS, artistHighlights, insightsSummary, journalInsights } from "@/lib/insights";
import { artworkUrlAtSize } from "@/lib/itunes";
import { moodLabel } from "@/lib/moodLabels";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// The same 40pt as the Avatar in Featuring, so every row's text lines up.
const ART = 40;
const TOP_ARTISTS = 5;
const TOP_PEOPLE = 8;
const TOP_MOODS = 8;

const plural = (n: number) => `${n.toLocaleString()} ${n === 1 ? "moment" : "moments"}`;

/**
 * Insights: what the journal says about its writer, as ruled sections like a
 * record's credits (DESIGN.md "The Liner Notes"). Everything comes from the
 * browse metadata the app already holds (lib/insights.ts). The first cut is
 * artists, people and moods; new sections are added to lib/insights.ts and
 * here. A section with nothing to say is left out, not shown empty.
 */
export default function InsightsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const meta = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - meta.dataUpdatedAt > BROWSE_META_STALE) meta.refetch();
    }, [meta])
  );

  const insights = useMemo(() => (meta.data ? journalInsights(meta.data) : null), [meta.data]);
  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  const moods = useMemo(() => {
    if (!insights) return [];
    return insights.moods
      .map((m) => ({ ...m, label: moodLabel(m.value, allMoods) }))
      .filter((m): m is typeof m & { label: string } => !!m.label)
      .slice(0, TOP_MOODS);
  }, [insights, allMoods]);

  if (meta.isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Insights" />
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      </View>
    );
  }

  if (meta.isError && !meta.data) {
    return (
      <ErrorState message={friendlyError(meta.error)} onRetry={() => meta.refetch()} onBack={() => router.back()} />
    );
  }

  const enough = !!insights && insights.moments >= INSIGHTS_MIN_MOMENTS;
  const highlights = insights ? artistHighlights(insights, TOP_ARTISTS) : null;
  const artists = highlights?.artists ?? [];
  const people = insights?.featuring.slice(0, TOP_PEOPLE) ?? [];
  const topMoodCount = moods[0]?.count ?? 1;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Insights" subtitle={insights && enough ? insightsSummary(insights) : undefined} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["3xl"] }]}
        testID="insights"
      >
        {!enough ? (
          <Text style={styles.empty}>
            Insights show up as your journal grows. A few more moments and there&apos;ll be something to see.
          </Text>
        ) : null}

        {enough && artists.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{highlights?.kind === "repeats" ? "Most written about" : "Artists so far"}</SectionLabel>
            {artists.map((a, i) => (
              <ListRow
                key={a.name}
                label={a.name}
                strong
                // A count once it means something; before that, the song.
                subtitle={a.count > 1 ? plural(a.count) : a.latestSong || plural(a.count)}
                leading={
                  a.artworkUrl ? (
                    <AppImage
                      source={{ uri: artworkUrlAtSize(a.artworkUrl, ART * 3) }}
                      style={styles.art}
                      contentFit="cover"
                    />
                  ) : (
                    <ArtworkPlaceholder style={styles.art} />
                  )
                }
                onPress={() => router.push({ pathname: "/artist", params: { name: a.name } })}
                last={i === artists.length - 1}
              />
            ))}
          </View>
        ) : null}

        {enough && people.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Featuring</SectionLabel>
            {people.map((p, i) => (
              <ListRow
                key={p.value}
                label={p.value}
                subtitle={plural(p.count)}
                leading={<Avatar path={null} name={p.value} size={40} />}
                onPress={() => router.push({ pathname: "/browse/person", params: { name: p.value } })}
                last={i === people.length - 1}
              />
            ))}
          </View>
        ) : null}

        {enough && moods.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Moods</SectionLabel>
            {moods.map((m) => (
              <Pressable
                key={m.value}
                onPress={() => router.push({ pathname: "/browse/mood", params: { value: m.value } })}
                style={({ pressed }) => [styles.moodRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${plural(m.count)}`}
              >
                <View style={styles.moodLine}>
                  <Text style={styles.moodWord} numberOfLines={1}>{m.label}</Text>
                  <Text style={styles.moodCount}>{m.count.toLocaleString()}</Text>
                </View>
                {/* Its share against the most-used mood: the one quiet chart. */}
                <View style={styles.moodTrack}>
                  <View style={[styles.moodBar, { width: `${Math.max(4, (m.count / topMoodCount) * 100)}%` }]} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
    },
    empty: {
      ...theme.typography.body,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.lg,
    },
    section: {
      marginTop: theme.spacing["2xl"],
    },
    art: {
      width: ART,
      height: ART,
      borderRadius: theme.radii.sm,
    },
    // No hairline under a mood: its bar already rules the row, and a line
    // under a line read as clutter.
    moodRow: {
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    pressed: {
      opacity: 0.6,
    },
    moodLine: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    moodWord: {
      ...theme.typography.body,
      color: theme.colors.text,
      flexShrink: 1,
    },
    moodCount: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    moodTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.fill,
      overflow: "hidden",
    },
    moodBar: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.text,
    },
  });
}
