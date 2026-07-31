import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { setCachedMoment } from "@/lib/momentCache";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_CARD_COLUMNS } from "@/lib/momentColumns";
import { fetchBrowseMetadata, BrowseMeta } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_SEARCH_STALE, SEARCH_DEBOUNCE_MS } from "@/lib/queryConfig";
import type { Moment } from "@/types";
import { EmptyState } from "@/components/EmptyState";


// ── helpers ────────────────────────────────────────────────

/**
 * Trailing-edge debounce. Local to this screen on purpose — the only consumer
 * is the search box below.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function deriveMoodCounts(meta: BrowseMeta[]) {
  const counts: Record<string, number> = {};
  for (const m of meta) {
    for (const mood of m.moods) counts[mood] = (counts[mood] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([mood, count]) => {
      const def = MOODS.find((m) => m.value === mood);
      return { mood, count, emoji: def?.emoji ?? "🎵", label: def?.label ?? mood };
    });
}

function derivePeopleCounts(meta: BrowseMeta[]) {
  const counts: Record<string, number> = {};
  for (const m of meta) {
    for (const p of m.people) {
      counts[p] = (counts[p] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function deriveYearCounts(meta: BrowseMeta[]) {
  const counts: Record<number, number> = {};
  for (const m of meta) {
    if (m.momentDate) {
      const y = new Date(m.momentDate + "T00:00:00").getFullYear();
      counts[y] = (counts[y] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, count]) => ({ year: Number(year), count }));
}

function deriveAlbumCounts(meta: BrowseMeta[]) {
  const seen = new Map<string, { albumName: string; artist: string; artworkUrl: string; count: number }>();
  for (const m of meta) {
    if (!m.songAlbumName) continue;
    const key = `${m.songAlbumName}|||${m.songArtist}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      seen.set(key, { albumName: m.songAlbumName, artist: m.songArtist, artworkUrl: m.songArtworkUrl, count: 1 });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count);
}

// ── sub-components ─────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, color: theme.colors.textTertiary, flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

function MoodCard({ emoji, label, count, onPress }: {
  mood: string; emoji: string; label: string; count: number; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginLeft: 10,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.cardBg,
        alignItems: "center",
        minWidth: 90,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text style={{ fontSize: 12, fontFamily: "DMSans_600SemiBold", color: theme.colors.text, marginTop: 6 }}>{label}</Text>
      <Text style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{count}</Text>
    </TouchableOpacity>
  );
}

function PersonCircle({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginLeft: 12, alignItems: "center" }}>
      <LinearGradient
        colors={["#E8825C", "#6B5F8C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 54, height: 54, borderRadius: 27,
          alignItems: "center", justifyContent: "center",
          borderWidth: 2, borderColor: theme.colors.background,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "DMSerifDisplay_400Regular", color: theme.colors.buttonText }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </LinearGradient>
      <Text style={{ fontSize: 11, fontFamily: "DMSans_500Medium", color: theme.colors.text, marginTop: 5 }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{count}</Text>
    </TouchableOpacity>
  );
}

function AlbumCard({ albumName, artist, artworkUrl, count, onPress }: {
  albumName: string; artist: string; artworkUrl: string; count: number; onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginLeft: 10, width: 100 }}>
      {artworkUrl ? (
        <AppImage source={{ uri: artworkUrl }} style={{ width: 100, height: 100, borderRadius: theme.radii.md }} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={["#E8825C", "#6B5F8C"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 100, height: 100, borderRadius: theme.radii.md, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="musical-notes" size={28} color="rgba(255,255,255,0.8)" />
        </LinearGradient>
      )}
      <Text style={{ fontSize: 12, fontFamily: "DMSans_600SemiBold", color: theme.colors.text, marginTop: 6 }} numberOfLines={1}>
        {albumName}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }} numberOfLines={1}>
        {count} moments
      </Text>
    </TouchableOpacity>
  );
}

function YearChip({ year, count, onPress }: { year: number; count: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        marginLeft: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: theme.radii.full,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 16, fontFamily: "DMSerifDisplay_400Regular", color: theme.colors.text }}>{year}</Text>
      <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 1 }}>{count} moments</Text>
    </TouchableOpacity>
  );
}


// ── search results ─────────────────────────────────────────

function SearchResults({ query, userId, allMoods }: { query: string; userId: string; allMoods: any[] }) {
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

// ── main screen ────────────────────────────────────────────

export default function BrowseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const moodCounts = useMemo(() => deriveMoodCounts(meta), [meta]);
  const peopleCounts = useMemo(() => derivePeopleCounts(meta), [meta]);
  const yearCounts = useMemo(() => deriveYearCounts(meta), [meta]);
  const albumCounts = useMemo(() => deriveAlbumCounts(meta), [meta]);

  const handleSearchClose = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
    searchInputRef.current?.blur();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {router.canGoBack() && (
            <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.eyebrow}>THE ARCHIVE</Text>
            <Text style={styles.title}>browse</Text>
          </View>
        </View>
      </View>

      {/* Always-visible search bar */}
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textTertiary} style={{ marginLeft: 12 }} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchBarInput}
          placeholder="Search songs, artists, reflections…"
          placeholderTextColor={theme.colors.placeholder}
          cursorColor={theme.colors.accent}
          value={searchText}
          onChangeText={(t) => { setSearchText(t); if (!searchActive) setSearchActive(true); }}
          onFocus={() => setSearchActive(true)}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchActive ? (
          <TouchableOpacity onPress={handleSearchClose} hitSlop={8} style={{ marginRight: 12 }}>
            <Text style={{ fontSize: 14, fontFamily: "DMSans_500Medium", color: theme.colors.accent }}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
        {searchText.length > 0 && !searchActive ? (
          <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8} style={{ marginRight: 12 }}>
            <Ionicons name="close-circle" size={16} color={theme.colors.placeholder} />
          </TouchableOpacity>
        ) : null}
      </View>

      {searchActive ? (
        <SearchResults query={searchText} userId={user?.id ?? ""} allMoods={allMoods} />
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Moods */}
        {moodCounts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader label="MOODS" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 10, paddingRight: 20 }}
            >
              {moodCounts.map(({ mood, emoji, label, count }) => (
                <MoodCard
                  key={mood}
                  mood={mood}
                  emoji={emoji}
                  label={label}
                  count={count}
                  onPress={() => router.push({ pathname: "/browse/mood", params: { value: mood } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* People */}
        {peopleCounts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader label="PEOPLE" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 8, paddingRight: 20 }}
            >
              {peopleCounts.map(({ name, count }) => (
                <PersonCircle
                  key={name}
                  name={name}
                  count={count}
                  onPress={() => router.push({ pathname: "/browse/person", params: { name } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Years */}
        {yearCounts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader label="YEARS" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 12, paddingRight: 20 }}
            >
              {yearCounts.map(({ year, count }) => (
                <YearChip
                  key={year}
                  year={year}
                  count={count}
                  onPress={() => router.push({ pathname: "/browse/year", params: { year: String(year) } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Albums */}
        {albumCounts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader label="ALBUMS" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 10, paddingRight: 20 }}
            >
              {albumCounts.map(({ albumName, artist, artworkUrl, count }) => (
                <AlbumCard
                  key={`${albumName}|||${artist}`}
                  albumName={albumName}
                  artist={artist}
                  artworkUrl={artworkUrl}
                  count={count}
                  onPress={() => router.push({ pathname: "/browse/album", params: { album: albumName, artist } })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    eyebrow: {
      fontSize: 10,
      fontFamily: "DMSans_700Bold",
      letterSpacing: 1.2,
      color: theme.colors.textTertiary,
      marginBottom: 2,
    },
    title: {
      fontSize: 30,
      fontFamily: "DMSerifDisplay_400Regular",
      color: theme.colors.text,
    },
    section: {
      marginTop: 28,
    },
    backBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: theme.colors.cardBg,
      alignItems: "center", justifyContent: "center",
    },
    searchBarWrapper: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 4,
      backgroundColor: theme.colors.cardBg,
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      gap: 8,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.text,
      paddingVertical: 10,
    },
  });
}
