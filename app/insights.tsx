import { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { usePostHog } from "posthog-react-native";
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
import {
  INSIGHTS_MIN_MOMENTS,
  artistHighlights,
  comingBack,
  comingBackWhen,
  insightsSummary,
  journalInsights,
  resonates,
  writingPattern,
} from "@/lib/insights";
import { artworkUrlAtSize } from "@/lib/itunes";
import { moodLabel } from "@/lib/moodLabels";
import { BROWSE_META_STALE } from "@/lib/queryConfig";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// The same 40pt as the Avatar in Featuring, so every row's text lines up.
const ART = 40;
const TOP_ARTISTS = 5;
const TOP_SONGS = 5;
const TOP_PEOPLE = 8;
const TOP_MOODS = 8;
const TOP_GENRES = 5;
const TOP_DECADES = 5;

const plural = (n: number) => `${n.toLocaleString()} ${n === 1 ? "moment" : "moments"}`;

type Styles = ReturnType<typeof createStyles>;

type InsightsSection = "artists" | "coming_back" | "genres" | "decades" | "when" | "featuring" | "moods";

/**
 * One ranked word with its count and a quiet ink bar of its share against the
 * top one: the one chart Insights allows. Moods, genres, decades and times of
 * day all use it, so they read alike. Tappable only when there's somewhere to go.
 */
function BarRow({
  label,
  count,
  max,
  styles,
  onPress,
}: {
  label: string;
  count: number;
  max: number;
  styles: Styles;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.barLine}>
        <Text style={styles.barWord} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.barCount}>{count.toLocaleString()}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.bar, { width: `${Math.max(4, (count / Math.max(1, max)) * 100)}%` }]} />
      </View>
    </>
  );
  const a11y = `${label}, ${plural(count)}`;
  if (!onPress) {
    return (
      <View style={styles.barRow} accessible accessibilityLabel={a11y}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.barRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      {content}
    </Pressable>
  );
}

/**
 * Insights: what the journal says about its writer, as ruled sections like a
 * record's credits (DESIGN.md "The Liner Notes"). Everything comes from the
 * browse metadata the app already holds (lib/insights.ts): artists, the songs
 * that keep coming back, genres and decades, when you write, people and moods;
 * new sections are added to lib/insights.ts and here. Each section leads with
 * one line you can take in at a glance, the rows under it are the depth. A
 * section with nothing to say is left out, not shown empty.
 */
export default function InsightsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const posthog = usePostHog();
  const { from } = useLocalSearchParams<{ from?: string }>();

  // Only the You preview passes `from`; anything else arrived by link.
  const openLogged = useRef(false);
  useEffect(() => {
    if (openLogged.current) return;
    openLogged.current = true;
    posthog?.capture("insights_opened", { from: from || "deep_link" });
  }, [from, posthog]);

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
  // Songs written about more than once, each with a line of when.
  const songs = useMemo(() => {
    if (!meta.data) return [];
    const now = new Date();
    return comingBack(meta.data, TOP_SONGS).map((s) => ({ ...s, when: comingBackWhen(s.dates, s.count, now) }));
  }, [meta.data]);
  // Genres and decades of the songs; when moments get written.
  const taste = useMemo(() => (meta.data ? resonates(meta.data) : null), [meta.data]);
  const writing = useMemo(() => (meta.data ? writingPattern(meta.data) : null), [meta.data]);
  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);

  const moods = useMemo(() => {
    if (!insights) return [];
    return insights.moods
      .map((m) => ({ ...m, label: moodLabel(m.value, allMoods) }))
      .filter((m): m is typeof m & { label: string } => !!m.label)
      .slice(0, TOP_MOODS);
  }, [insights, allMoods]);

  const enough = !!insights && insights.moments >= INSIGHTS_MIN_MOMENTS;
  const highlights = insights ? artistHighlights(insights, TOP_ARTISTS) : null;
  const artists = highlights?.artists ?? [];
  const people = insights?.featuring.slice(0, TOP_PEOPLE) ?? [];
  const topMoodCount = moods[0]?.count ?? 1;
  // A single row only repeats the line above it, so rows show from two.
  const genres = taste && taste.genres.length > 1 ? taste.genres.slice(0, TOP_GENRES) : [];
  const decades = taste && taste.decades.length > 1 ? taste.decades.slice(0, TOP_DECADES) : [];
  const times = writing && writing.times.length > 1 ? writing.times : [];
  const topTimeCount = Math.max(1, ...times.map((t) => t.count));
  // The pattern line leads; with no pattern, the busiest month does.
  const writingLine = writing?.line ?? (writing?.busiestMonth ? `Busiest in ${writing.busiestMonth}` : null);
  const writingSub = writing?.line && writing.busiestMonth ? `Busiest in ${writing.busiestMonth}` : null;

  // Analytics: which sections had something to show, once per open. Section
  // names only, never the artists, songs or people in them.
  const shownSections: InsightsSection[] = [];
  if (enough) {
    if (artists.length > 0) shownSections.push("artists");
    if (songs.length > 0) shownSections.push("coming_back");
    if (taste?.genreLine || genres.length > 0) shownSections.push("genres");
    if (taste?.periodLine || decades.length > 0) shownSections.push("decades");
    if (writingLine) shownSections.push("when");
    if (people.length > 0) shownSections.push("featuring");
    if (moods.length > 0) shownSections.push("moods");
  }
  const shownKey = shownSections.join(",");
  const hasData = !!meta.data;
  const sectionsLogged = useRef(false);
  useEffect(() => {
    if (!hasData || sectionsLogged.current) return;
    sectionsLogged.current = true;
    posthog?.capture("insights_sections_shown", { sections: shownKey ? shownKey.split(",") : [] });
  }, [hasData, shownKey, posthog]);
  const tapped = (section: InsightsSection) => posthog?.capture("insights_section_tapped", { section });

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
                onPress={() => {
                  tapped("artists");
                  router.push({ pathname: "/artist", params: { name: a.name } });
                }}
                last={i === artists.length - 1}
              />
            ))}
          </View>
        ) : null}

        {/* Only when true: no empty state, a song that never repeats isn't news. */}
        {enough && songs.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Songs you keep coming back to</SectionLabel>
            {songs.map((s, i) => (
              <ListRow
                key={`${s.title}\u0000${s.artist}`}
                label={s.title.trim()}
                strong
                // Song then artist (Graphite), then when it came back.
                subtitle={`${s.artist.trim()}\n${s.when}`}
                subtitleLines={3}
                leading={
                  s.artworkUrl ? (
                    <AppImage
                      source={{ uri: artworkUrlAtSize(s.artworkUrl, ART * 3) }}
                      style={styles.art}
                      contentFit="cover"
                    />
                  ) : (
                    <ArtworkPlaceholder style={styles.art} />
                  )
                }
                onPress={() => {
                  tapped("coming_back");
                  router.push({ pathname: "/song", params: { title: s.title, artist: s.artist } });
                }}
                accessibilityLabel={`${s.title.trim()} by ${s.artist.trim()}, ${s.when}`}
                last={i === songs.length - 1}
              />
            ))}
          </View>
        ) : null}

        {/* Each half only when it has something to say (lib/insights.ts resonates). */}
        {enough && taste ? (
          <View style={styles.section}>
            <SectionLabel>What resonates</SectionLabel>
            {taste.genreLine ? <Text style={styles.headline}>{taste.genreLine}</Text> : null}
            {genres.map((g) => (
              <BarRow key={g.value} label={g.value} count={g.count} max={genres[0].count} styles={styles} />
            ))}
            {taste.periodLine ? (
              <Text style={[styles.headline, taste.genreLine ? styles.headlineNext : null]}>{taste.periodLine}</Text>
            ) : null}
            {decades.map((d) => (
              <BarRow key={d.decade} label={`${d.decade}s`} count={d.count} max={decades[0].count} styles={styles} />
            ))}
          </View>
        ) : null}

        {/* Patterns only, never absence (lib/insights.ts writingPattern). */}
        {enough && writingLine ? (
          <View style={styles.section}>
            <SectionLabel>When you write</SectionLabel>
            <Text style={styles.headline}>{writingLine}</Text>
            {writingSub ? <Text style={styles.subline}>{writingSub}</Text> : null}
            {times.map((t) => (
              <BarRow key={t.value} label={t.label} count={t.count} max={topTimeCount} styles={styles} />
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
                onPress={() => {
                  tapped("featuring");
                  router.push({ pathname: "/browse/person", params: { name: p.value } });
                }}
                last={i === people.length - 1}
              />
            ))}
          </View>
        ) : null}

        {enough && moods.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Moods</SectionLabel>
            {moods.map((m) => (
              <BarRow
                key={m.value}
                label={m.label}
                count={m.count}
                max={topMoodCount}
                styles={styles}
                onPress={() => {
                  tapped("moods");
                  router.push({ pathname: "/browse/mood", params: { value: m.value } });
                }}
              />
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
    // A section's one glanceable line ("Mostly pop and hip-hop/rap"), above its rows.
    headline: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    // A second line in the same section starts a new group.
    headlineNext: {
      marginTop: theme.spacing.lg,
    },
    subline: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      paddingBottom: theme.spacing.xs,
    },
    // No hairline under a bar row: its bar already rules the row, and a line
    // under a line read as clutter.
    barRow: {
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    pressed: {
      opacity: 0.6,
    },
    barLine: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    barWord: {
      ...theme.typography.body,
      color: theme.colors.text,
      flexShrink: 1,
    },
    barCount: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    barTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.fill,
      overflow: "hidden",
    },
    bar: {
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.text,
    },
  });
}
