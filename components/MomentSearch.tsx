import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { friendlyError } from "@/lib/errors";
import type { BrowseMeta } from "@/lib/browse";
import { localSearchMatches, searchArchive } from "@/lib/archiveSearch";
import type { MoodLabelDefinition } from "@/lib/moodLabels";
import { artworkUrlAtSize } from "@/lib/itunes";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { setCachedMoment } from "@/lib/momentCache";
import { BROWSE_SEARCH_STALE, SEARCH_DEBOUNCE_MS } from "@/lib/queryConfig";

// Full-library moment search results. Lived inside the Browse tab until the
// reflections reorg folded the archive into Reflections; extracted so the
// screen file stays readable. The host owns the TextInput (and what shows
// before anything is typed); this renders the result list for a query.
// What matches where (server vs phone) is in lib/archiveSearch.ts.

// 44pt artwork at 3x.
const ROW_ARTWORK_PX = 132;

/**
 * Trailing-edge debounce. Local to this component on purpose — the only
 * consumer is the search results below.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function MomentSearch({
  query,
  userId,
  meta,
  allMoods,
}: {
  query: string;
  userId: string;
  /** The screen's browse metadata: album, people and moods match against it. */
  meta: readonly BrowseMeta[];
  allMoods: readonly MoodLabelDefinition[];
}) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // The query key is built from the debounced text: typing "beatles" is one
  // request at the end, not one per keystroke.
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const debouncePending = query.trim() !== debouncedQuery.trim();

  // Album, people and moods match on the phone; only their rows are read.
  const localIds = useMemo(
    () => localSearchMatches(meta, debouncedQuery, allMoods),
    [meta, debouncedQuery, allMoods]
  );

  const { data: results = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["browseSearch", userId, debouncedQuery, localIds],
    queryFn: () => searchArchive(userId, debouncedQuery, localIds, allMoods),
    // `!!userId` matters: the screen passes `user?.id ?? ""` while auth settles,
    // and an empty string reaches Postgres as `user_id = ''` — an invalid-uuid
    // error, retried.
    enabled: !!userId && debouncedQuery.trim().length > 0,
    staleTime: BROWSE_SEARCH_STALE,
    // Each keystroke lands on a cold cache entry; without this the list would
    // empty out and repaint between every letter.
    placeholderData: keepPreviousData,
  });

  // Nothing typed: the host decides what to offer (it used to repeat the
  // field's placeholder here).
  if (!query.trim()) return null;

  // keepPreviousData would otherwise keep the last query's results on screen
  // as if they matched this one.
  if (isError && !debouncePending) {
    return <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />;
  }

  if (results.length === 0) {
    // Only distinguish "still working" from "genuinely nothing" when there is
    // nothing to show — with keepPreviousData a background refetch keeps the
    // previous results on screen instead of blanking them.
    if (isLoading || debouncePending) return (
      <EmptyState icon="search-outline" title="Searching…" />
    );
    return (
      <EmptyState
        icon="search-outline"
        title="No results"
        subtitle={`Nothing in your journal matches “${query.trim()}”. Try a song, an artist, a person, a place or a word you wrote.`}
      />
    );
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(r) => r.moment.id}
      contentContainerStyle={styles.list}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item: { moment: item, why } }) => (
        // A row on paper, ruled by a hairline (DESIGN.md, Rows Not Boxes).
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            setCachedMoment(item);
            router.push({ pathname: "/moment/[id]", params: { id: item.id } });
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          {item.songArtworkUrl ? (
            <AppImage source={{ uri: artworkUrlAtSize(item.songArtworkUrl, ROW_ARTWORK_PX) }} style={styles.artwork} />
          ) : (
            <ArtworkPlaceholder style={styles.artwork} />
          )}
          <View style={styles.text}>
            <Text style={styles.song} numberOfLines={1}>
              {item.songTitle}
              <Text style={styles.artist}>{`  ${item.songArtist}`}</Text>
            </Text>
            {why ? (
              // Matched on a person, the place, a mood or the album: say which.
              <Text style={styles.why} numberOfLines={1}>
                {why}
              </Text>
            ) : item.reflectionText ? (
              <Text style={styles.reflection} numberOfLines={1}>
                {item.reflectionText.replace(/\s+/g, " ").trim()}
              </Text>
            ) : null}
          </View>
          {item.momentDate ? (
            <Text style={styles.date}>
              {new Date(item.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    list: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: 120,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    artwork: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.sm,
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    // Song then artist on one line (DESIGN.md, Song Then Artist).
    song: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    artist: {
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    // What the person wrote: Newsreader, upright.
    reflection: {
      fontFamily: theme.fonts.reading,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    why: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    date: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      alignSelf: "flex-start",
      paddingTop: 2,
    },
  });
}
