import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import * as MediaLibrary from "expo-media-library/legacy";
import { AppImage } from "@/components/AppImage";
import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { getLibrarySongs, requestLibraryAccess, type LibrarySong } from "@/modules/now-playing";
import {
  BULK_DAY_THRESHOLD,
  bulkDays,
  candidateSongs,
  pairingLine,
  pairingScore,
  photoWindow,
} from "@/lib/libraryMoments";
import { setSuggestDayPhotos, suggestDayPhotos } from "@/lib/lastWeekData";

// Photos ↔ music prototype (1.4). Hidden: long-press the version line at the
// bottom of Settings, in development and the beta app only. It runs only on
// this phone and saves nothing but the day-photos switch. Its job
// is to show whether Apple Music's "date added" is good enough to pair songs
// with photos (see lib/libraryMoments.ts and ROADMAP "three moments a week").

const SONG_LIMIT = 5000;
const CANDIDATES = 60;
const SHOWN = 25;

type ScreenState = "idle" | "loading" | "denied" | "ready" | "error";

interface Pairing {
  song: LibrarySong;
  photoCount: number;
  photoUris: string[];
  score: number;
}

interface Stats {
  songs: number;
  bulkDays: { day: string; count: number }[];
  songsOnBulkDays: number;
  checked: number;
  withPhotos: number;
  photoAccess: string;
}

async function photosAround(dateAdded: number): Promise<{ count: number; uris: string[] }> {
  const { from, to } = photoWindow(dateAdded);
  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter: from,
    createdBefore: to,
    first: 4,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  return { count: page.totalCount, uris: page.assets.map((a) => a.uri) };
}

/** Development and the beta app only; the App Store app goes home instead. */
const DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_APP_ENV === "preview";

export default function LibraryPrototypeRoute() {
  if (!DEV_TOOLS) return <Redirect href="/" />;
  return <LibraryPrototype />;
}

function LibraryPrototype() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [state, setState] = useState<ScreenState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  // Last week's "Photos from that day" in capture: Josh's call whether it stays.
  const [dayPhotos, setDayPhotos] = useState(true);
  useEffect(() => {
    void suggestDayPhotos().then(setDayPhotos);
  }, []);

  const run = useCallback(async () => {
    setState("loading");
    setMessage(null);
    try {
      const music = await requestLibraryAccess();
      if (music !== "authorized") {
        setMessage(`Apple Music library access is "${music}". Allow it in iOS Settings → Soundtracks.`);
        setState("denied");
        return;
      }
      const photos = await MediaLibrary.requestPermissionsAsync();
      if (!photos.granted) {
        setMessage("Photo library access is off. Allow it in iOS Settings → Soundtracks → Photos.");
        setState("denied");
        return;
      }

      const songs = await getLibrarySongs(SONG_LIMIT);
      const bulk = bulkDays(songs);
      const bulkSet = new Set(bulk.map((b) => b.day));
      const songsOnBulkDays = bulk.reduce((n, b) => n + b.count, 0);
      const candidates = candidateSongs(songs, Date.now(), CANDIDATES, bulkSet);

      const found: Pairing[] = [];
      for (const song of candidates) {
        const p = await photosAround(song.dateAdded);
        found.push({
          song,
          photoCount: p.count,
          photoUris: p.uris,
          score: pairingScore(p.count, song.playCount),
        });
      }
      const ranked = found.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);

      setStats({
        songs: songs.length,
        bulkDays: bulk.slice(0, 5),
        songsOnBulkDays,
        checked: candidates.length,
        withPhotos: ranked.length,
        photoAccess: photos.accessPrivileges ?? "unknown",
      });
      setPairings(ranked.slice(0, SHOWN));
      setState("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");

  const header = (
    <View style={styles.intro}>
      <View style={styles.toggle}>
        <Text style={[styles.body, styles.toggleLabel]}>Last week: suggest that day&apos;s photos in capture</Text>
        <Switch
          value={dayPhotos}
          onValueChange={(on) => {
            setDayPhotos(on);
            void setSuggestDayPhotos(on);
          }}
          trackColor={{ true: theme.colors.switchOn }}
        />
      </View>
      <Text style={styles.body}>
        Pairs songs from your Apple Music library with the photos you took the week you added them. Runs on this
        phone only and saves nothing.
      </Text>
      {state === "idle" || state === "denied" || state === "error" ? (
        <Button label={state === "idle" ? "Scan my library" : "Try again"} onPress={run} />
      ) : null}
      {state === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.textSecondary} />
          <Text style={styles.meta}>Reading your library and photos…</Text>
        </View>
      ) : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}
      {stats && stats.songs === 0 ? (
        <Text style={styles.meta}>
          No songs in this phone&apos;s Apple Music library. Songs you&apos;ve added to your library (not just
          streamed) are what this reads.
        </Text>
      ) : null}
      {stats && stats.songs > 0 ? (
        <View style={styles.stats}>
          <Text style={styles.stat}>{stats.songs.toLocaleString()} songs read (newest first, up to {SONG_LIMIT.toLocaleString()})</Text>
          <Text style={styles.stat}>
            {stats.bulkDays.length
              ? `${stats.songsOnBulkDays.toLocaleString()} (${pct(stats.songsOnBulkDays, stats.songs)}) were added on busy days, more than ${BULK_DAY_THRESHOLD} in one day. Those read as syncs or imports and are left out:`
              : `No busy days: no day has more than ${BULK_DAY_THRESHOLD} songs added, so every date looks like a real choice.`}
          </Text>
          {stats.bulkDays.map((b) => (
            <Text key={b.day} style={styles.statSub}>
              {b.day}: {b.count} songs
            </Text>
          ))}
          <Text style={styles.stat}>
            {stats.withPhotos} of the {stats.checked} most played older songs have photos that week
          </Text>
          <Text style={styles.stat}>Photo access: {stats.photoAccess}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Photos and music" subtitle="Prototype" />
      <FlatList
        data={pairings}
        keyExtractor={(p) => p.song.persistentId}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.song}>
              {item.song.title} · {item.song.artistName}
            </Text>
            <Text style={styles.line}>{pairingLine(item.song.title, item.song.dateAdded, item.photoCount)}</Text>
            <Text style={styles.meta}>
              Played {item.song.playCount} times
              {item.song.lastPlayed ? ` · last ${new Date(item.song.lastPlayed).toLocaleDateString()}` : ""} · score{" "}
              {item.score.toFixed(1)}
            </Text>
            <View style={styles.photos}>
              {item.photoUris.map((uri) => (
                <AppImage key={uri} source={{ uri }} style={styles.photo} contentFit="cover" />
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing["3xl"] },
    intro: { gap: theme.spacing.md, paddingBottom: theme.spacing.lg },
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    toggleLabel: { flex: 1 },
    body: { ...theme.typography.body, color: theme.colors.text },
    loading: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    stats: { gap: theme.spacing.xs },
    stat: { ...theme.typography.body, color: theme.colors.text },
    statSub: { ...theme.typography.meta, color: theme.colors.textSecondary, paddingLeft: theme.spacing.md },
    row: {
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    song: { ...theme.typography.bodyStrong, color: theme.colors.text },
    line: { fontFamily: theme.fonts.reading, fontSize: theme.fontSize.reading, color: theme.colors.text },
    meta: { ...theme.typography.meta, color: theme.colors.textSecondary },
    photos: { flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xs },
    photo: { width: 72, height: 72, borderRadius: theme.radii.sm },
  });
}
