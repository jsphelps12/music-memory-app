import { useMemo, useState, useCallback } from "react";
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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MOODS } from "@/constants/Moods";
import { setCachedMoment } from "@/lib/momentCache";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import {
  fetchBrowseMetadata,
  fetchCalendarMonth,
  BrowseMeta,
} from "@/lib/browse";
import type { Moment } from "@/types";

const MOOD_TINTS: Record<string, string> = {
  nostalgic: "#d4a574",
  joyful: "#E8A55C",
  melancholy: "#5a7a8c",
  energetic: "#c4707a",
  peaceful: "#7a8c5a",
  romantic: "#c4707a",
  rebellious: "#c4707a",
  hopeful: "#E8825C",
  bittersweet: "#9b6b4a",
  empowered: "#7a5a8c",
};

const PERSON_GRADIENTS = [
  ["#E8825C", "#6B5F8C"],
  ["#5a7a8c", "#2a3a4a"],
  ["#7a8c5a", "#3a4a2a"],
  ["#d4a574", "#9b6b4a"],
  ["#c4707a", "#7a3a4a"],
];

// ── helpers ────────────────────────────────────────────────

function deriveMoodCounts(meta: BrowseMeta[]) {
  const counts: Record<string, number> = {};
  for (const m of meta) {
    if (m.mood) counts[m.mood] = (counts[m.mood] ?? 0) + 1;
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

function deriveOnThisDay(meta: BrowseMeta[]) {
  const today = new Date();
  const m = today.getMonth();
  const d = today.getDate();
  const y = today.getFullYear();
  return meta.filter((item) => {
    if (!item.momentDate) return false;
    const date = new Date(item.momentDate + "T00:00:00");
    return date.getMonth() === m && date.getDate() === d && date.getFullYear() < y;
  });
}

function yearsAgo(dateStr: string): string {
  const then = new Date(dateStr + "T00:00:00").getFullYear();
  const diff = new Date().getFullYear() - then;
  return diff === 1 ? "1 year ago today" : `${diff} years ago today`;
}

// ── sub-components ─────────────────────────────────────────

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 10, fontFamily: "DMSans_700Bold", letterSpacing: 1.2, color: theme.colors.textTertiary, flex: 1 }}>
        {label}
      </Text>
      {right}
    </View>
  );
}

function ResurfacedCard({ item, onPress }: { item: BrowseMeta; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginLeft: 12, width: 180 }}>
      <LinearGradient
        colors={["#E8825C", "#6B5F8C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: theme.radii.md, height: 96, padding: 12, justifyContent: "flex-end" }}
      >
        <Text style={{ fontSize: 13, fontFamily: "DMSans_600SemiBold", color: "#fff" }} numberOfLines={1}>
          {item.songTitle}
        </Text>
        <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }} numberOfLines={1}>
          {item.songArtist}
        </Text>
        <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4, fontFamily: "DMSans_400Regular" }}>
          {item.momentDate ? yearsAgo(item.momentDate) : ""}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function MoodCard({ mood, emoji, label, count, onPress }: {
  mood: string; emoji: string; label: string; count: number; onPress: () => void;
}) {
  const theme = useTheme();
  const tint = MOOD_TINTS[mood] ?? theme.colors.accent;
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
      <Text style={{ fontSize: 11, color: tint, fontFamily: "DMSans_500Medium", marginTop: 2 }}>{count}</Text>
    </TouchableOpacity>
  );
}

function PersonCircle({ name, count, index }: { name: string; count: number; index: number }) {
  const theme = useTheme();
  const grad = PERSON_GRADIENTS[index % PERSON_GRADIENTS.length] as [string, string];
  return (
    <View style={{ marginLeft: 12, alignItems: "center" }}>
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 54, height: 54, borderRadius: 27,
          alignItems: "center", justifyContent: "center",
          borderWidth: 2, borderColor: theme.colors.background,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "DMSerifDisplay_400Regular", color: "#fff" }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </LinearGradient>
      <Text style={{ fontSize: 11, fontFamily: "DMSans_500Medium", color: theme.colors.text, marginTop: 5 }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{count}</Text>
    </View>
  );
}

function YearChip({ year, count, active }: { year: number; count: number; active: boolean }) {
  const theme = useTheme();
  return (
    <View style={{
      marginLeft: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radii.full,
      backgroundColor: active ? theme.colors.buttonBg : "transparent",
      borderWidth: 1,
      borderColor: active ? theme.colors.buttonBg : theme.colors.border,
      alignItems: "center",
    }}>
      <Text style={{
        fontSize: 16,
        fontFamily: "DMSerifDisplay_400Regular",
        color: active ? theme.colors.buttonText : theme.colors.text,
      }}>{year}</Text>
      <Text style={{ fontSize: 9, color: active ? theme.colors.buttonText : theme.colors.textTertiary, marginTop: 1 }}>
        {count} moments
      </Text>
    </View>
  );
}

function MiniCalendar({
  year, month, datesWithMoments, today,
}: {
  year: number; month: number; datesWithMoments: Set<string>; today: Date;
}) {
  const theme = useTheme();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const hasMoment = (d: number) => datesWithMoments.has(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  return (
    <View style={{ paddingHorizontal: 20 }}>
      {/* Weekday headers */}
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        {weekdays.map((w, i) => (
          <Text key={i} style={{
            flex: 1, textAlign: "center", fontSize: 9,
            fontFamily: "DMSans_700Bold", letterSpacing: 0.5,
            color: theme.colors.textTertiary,
          }}>{w}</Text>
        ))}
      </View>
      {/* Day grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => (
          <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
            {d ? (
              <View style={{
                flex: 1, borderRadius: 6, alignItems: "center", justifyContent: "center",
                backgroundColor: hasMoment(d)
                  ? theme.colors.accent + "33"
                  : theme.colors.backgroundSecondary,
                borderWidth: isToday(d) ? 1.5 : 0,
                borderColor: theme.colors.accent,
              }}>
                <Text style={{
                  fontSize: 11,
                  fontFamily: hasMoment(d) ? "DMSans_600SemiBold" : "DMSans_400Regular",
                  color: hasMoment(d) ? theme.colors.accent : theme.colors.textTertiary,
                }}>{d}</Text>
              </View>
            ) : <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── search results ─────────────────────────────────────────

function SearchResults({ query, userId, allMoods }: { query: string; userId: string; allMoods: any[] }) {
  const router = useRouter();
  const theme = useTheme();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["browseSearch", userId, query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const term = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const { data, error } = await supabase
        .from("moments")
        .select("*")
        .eq("user_id", userId)
        .or(`song_title.ilike.%${term}%,song_artist.ilike.%${term}%,reflection_text.ilike.%${term}%`)
        .order("moment_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(mapRowToMoment);
    },
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  });

  if (!query.trim()) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textTertiary, fontFamily: "DMSans_400Regular", fontSize: 14 }}>
        Search songs, reflections, artists…
      </Text>
    </View>
  );

  if (isFetching) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textTertiary, fontSize: 14 }}>Searching…</Text>
    </View>
  );

  if (results.length === 0) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.colors.textTertiary, fontSize: 14 }}>No results</Text>
    </View>
  );

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
            <Image source={{ uri: item.songArtworkUrl }} style={{ width: 44, height: 44, borderRadius: 6 }} />
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

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: calendarDates = [] } = useQuery({
    queryKey: ["browseCalendar", user?.id, currentYear, currentMonth],
    queryFn: () => fetchCalendarMonth(user!.id, currentYear, currentMonth),
    enabled: !!user,
    staleTime: 60_000,
  });

  const moodCounts = useMemo(() => deriveMoodCounts(meta), [meta]);
  const peopleCounts = useMemo(() => derivePeopleCounts(meta), [meta]);
  const yearCounts = useMemo(() => deriveYearCounts(meta), [meta]);
  const onThisDay = useMemo(() => deriveOnThisDay(meta), [meta]);
  const datesWithMoments = useMemo(() => new Set(calendarDates), [calendarDates]);

  const daysWithMoments = calendarDates.length;
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const handleSearchClose = useCallback(() => {
    setSearchActive(false);
    setSearchText("");
  }, []);

  if (searchActive) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Search header */}
        <View style={styles.searchHeader}>
          <TouchableOpacity onPress={handleSearchClose} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, reflections, artists…"
            placeholderTextColor={theme.colors.placeholder}
            cursorColor={theme.colors.accent}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.placeholder} />
            </TouchableOpacity>
          )}
        </View>
        <SearchResults query={searchText} userId={user?.id ?? ""} allMoods={allMoods} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>THE ARCHIVE</Text>
            <Text style={styles.title}>browse</Text>
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setSearchActive(true)}
            hitSlop={8}
          >
            <Ionicons name="search" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* On This Day */}
        {onThisDay.length > 0 && (
          <View style={styles.section}>
            <SectionHeader label="ON THIS DAY" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 8, paddingRight: 20 }}
            >
              {onThisDay.map((item) => (
                <ResurfacedCard
                  key={item.id}
                  item={item}
                  onPress={() => router.push({ pathname: "/moment/[id]", params: { id: item.id } })}
                />
              ))}
            </ScrollView>
          </View>
        )}

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
                  onPress={() => router.push({ pathname: "/(tabs)/browse/mood", params: { value: mood } })}
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
              {peopleCounts.map(({ name, count }, i) => (
                <PersonCircle key={name} name={name} count={count} index={i} />
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
                  active={year === currentYear}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Calendar */}
        <View style={styles.section}>
          <SectionHeader
            label="CALENDAR"
            right={
              <Text style={{ fontSize: 11, color: theme.colors.textTertiary }}>
                {daysWithMoments} of {new Date(currentYear, currentMonth, 0).getDate()} days
              </Text>
            }
          />
          <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
          <MiniCalendar
            year={currentYear}
            month={currentMonth}
            datesWithMoments={datesWithMoments}
            today={today}
          />
        </View>
      </ScrollView>
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
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
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
    headerIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.colors.cardBg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    section: {
      marginTop: 28,
    },
    calendarMonthLabel: {
      fontSize: 13,
      fontFamily: "DMSans_600SemiBold",
      color: theme.colors.textSecondary,
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    searchHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: "DMSans_400Regular",
      color: theme.colors.text,
    },
  });
}
