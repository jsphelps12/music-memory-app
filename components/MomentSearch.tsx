import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { AppImage } from "@/components/AppImage";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { setCachedMoment } from "@/lib/momentCache";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { BROWSE_SEARCH_STALE, SEARCH_DEBOUNCE_MS } from "@/lib/queryConfig";

// Full-library moment search results. Lived inside the Browse tab until the
// reflections reorg folded the archive into Reflections; extracted so the
// screen file stays readable. The host owns the TextInput; this renders the
// result list for whatever it's given.

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

export function MomentSearch({ query, userId }: { query: string; userId: string }) {
  const router = useRouter();
  const theme = useTheme();

  // The query key is built from the debounced text: typing "beatles" is one
  // request at the end, not one per keystroke.
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const debouncePending = query.trim() !== debouncedQuery.trim();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["browseSearch", userId, debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const term = debouncedQuery.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const { data, error } = await supabase
        .from("moments")
        .select(MOMENT_CARD_COLUMNS)
        .eq("user_id", userId)
        .or(`song_title.ilike.%${term}%,song_artist.ilike.%${term}%,reflection_text.ilike.%${term}%`)
        .order("moment_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRowToMoment);
    },
    // `!!userId` matters: the screen passes `user?.id ?? ""` while auth settles,
    // and an empty string reaches Postgres as `user_id = ''` — an invalid-uuid
    // error, retried.
    enabled: !!userId && debouncedQuery.trim().length > 0,
    staleTime: BROWSE_SEARCH_STALE,
    // Each keystroke lands on a cold cache entry; without this the list would
    // empty out and repaint between every letter.
    placeholderData: keepPreviousData,
  });

  if (!query.trim()) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textTertiary, fontFamily: "DMSans_400Regular", fontSize: 14 }}>
        Search songs, reflections, artists…
      </Text>
    </View>
  );

  if (results.length === 0) {
    // Only distinguish "still working" from "genuinely nothing" when there is
    // nothing to show — with keepPreviousData a background refetch keeps the
    // previous results on screen instead of blanking them.
    if (isLoading || debouncePending) return (
      <EmptyState icon="search-outline" title="Searching…" />
    );
    return (
      <EmptyState icon="search-outline" title="No results" subtitle="Try a different song, artist, or reflection." />
    );
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 20, gap: 8 }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            backgroundColor: theme.colors.cardBg, borderRadius: theme.radii.md, padding: 10,
          }}
          onPress={() => {
            setCachedMoment(item);
            router.push({ pathname: "/moment/[id]", params: { id: item.id } });
          }}
          activeOpacity={0.8}
        >
          {item.songArtworkUrl ? (
            <AppImage source={{ uri: item.songArtworkUrl }} style={{ width: 44, height: 44, borderRadius: 6 }} />
          ) : (
            <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: theme.colors.backgroundSecondary }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "DMSans_600SemiBold", color: theme.colors.text }} numberOfLines={1}>
              {item.songTitle}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {item.songArtist}
            </Text>
            {item.reflectionText ? (
              <Text style={{ fontSize: 12, color: theme.colors.textTertiary, fontStyle: "italic", marginTop: 3 }} numberOfLines={1}>
                {item.reflectionText}
              </Text>
            ) : null}
          </View>
          {item.momentDate ? (
            <Text style={{ fontSize: 11, color: theme.colors.textTertiary, flexShrink: 0 }}>
              {new Date(item.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
  );
}
