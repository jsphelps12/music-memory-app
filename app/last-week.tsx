import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { usePostHog } from "posthog-react-native";
import * as Haptics from "expo-haptics";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { ErrorState } from "@/components/ErrorState";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { useLastWeek } from "@/hooks/useLastWeek";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { friendlyError } from "@/lib/errors";
import { artworkUrlAtSize } from "@/lib/itunes";
import { dayLabel, songReasonLine, weekLabel, type WeekDay, type WeekPhoto, type WeekSong } from "@/lib/lastWeek";
import { markWeekSeen, photoFileUri, songForCreate } from "@/lib/lastWeekData";

const ART = 48;
const PHOTO = 72;

/**
 * "Last week" (1.4): the week just ended, by day, newest first. Each day has
 * the songs added, played a lot or streamed, and the camera photos taken.
 * A song opens a new moment with it filled in; a photo starts one with that
 * photo; a song already saved shows "Saved" and opens its moment. Pushed
 * (not presented) so capture stacks on top and returns here after a save,
 * ready for the next one.
 */
export default function LastWeekScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const posthog = usePostHog();
  const { data, isLoading, error, refetch } = useLastWeek();
  const [opening, setOpening] = useState<string | null>(null);
  const markedSeen = useRef(false);

  useEffect(() => {
    if (data && !markedSeen.current) {
      markedSeen.current = true;
      void markWeekSeen(data.week);
    }
  }, [data]);

  const openSong = useCallback(
    (song: WeekSong) => {
      if (!data) return;
      Haptics.selectionAsync();
      const momentId = data.saved[song.key];
      if (momentId) {
        router.push(`/moment/${momentId}`);
        return;
      }
      const s = songForCreate(song, data.catalog);
      posthog?.capture("last_week_song_tapped", { reason: song.reason, has_catalog: !!(song.storeId && data.catalog[song.storeId]) });
      router.push({
        pathname: "/create",
        params: {
          songId: s.id,
          songTitle: s.title,
          songArtist: s.artistName,
          songAlbum: s.albumName,
          songArtwork: s.artworkUrl,
          songProvider: s.provider,
          songAppleMusicId: s.appleMusicId ?? "",
          songSpotifyId: s.spotifyId ?? "",
          songDurationMs: String(s.durationMs),
          photosDay: song.day,
          momentAt: String(song.at),
          source: "last_week",
        },
      });
    },
    [data, router, posthog]
  );

  const openPhoto = useCallback(
    async (photo: WeekPhoto, day: string) => {
      if (opening) return;
      Haptics.selectionAsync();
      setOpening(photo.id);
      const uri = await photoFileUri(photo);
      setOpening(null);
      if (!uri) return;
      posthog?.capture("last_week_photo_tapped");
      router.push({
        pathname: "/create",
        params: { sharedPhotoPaths: JSON.stringify([uri]), photosDay: day, momentAt: String(photo.createdAt), source: "last_week" },
      });
    },
    [opening, router, posthog]
  );

  const renderDay = ({ item }: { item: WeekDay }) => (
    <View style={styles.day}>
      <SectionLabel>{dayLabel(item.key)}</SectionLabel>
      {item.songs.map((song) => {
        const s = data ? songForCreate(song, data.catalog) : null;
        const saved = !!data?.saved[song.key];
        return (
          <TouchableOpacity
            key={song.key}
            style={styles.songRow}
            activeOpacity={0.7}
            onPress={() => openSong(song)}
            accessibilityRole="button"
            accessibilityLabel={`${song.title}, ${song.artistName}. ${songReasonLine(song)}.${saved ? " Saved." : ""}`}
            accessibilityHint={saved ? "Opens the moment" : "Starts a moment with this song"}
          >
            {s?.artworkUrl ? (
              <AppImage source={{ uri: artworkUrlAtSize(s.artworkUrl, ART * 3) }} style={styles.art} transition={150} />
            ) : (
              <ArtworkPlaceholder style={styles.art} />
            )}
            <View style={styles.songText}>
              <Text style={styles.songLine} numberOfLines={1}>
                <Text style={styles.songTitle}>{song.title}</Text>
                <Text style={styles.songArtist}>{`  ${song.artistName}`}</Text>
              </Text>
              <Text style={styles.reason} numberOfLines={1}>
                {songReasonLine(song)}
              </Text>
            </View>
            {saved ? (
              <Text style={styles.saved}>Saved</Text>
            ) : (
              <Icon name="add" size={20} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>
        );
      })}
      {item.photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoScroll}
          contentContainerStyle={styles.photoStrip}
        >
          {item.photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              activeOpacity={0.8}
              onPress={() => openPhoto(photo, item.key)}
              accessibilityRole="button"
              accessibilityLabel="Start a moment with this photo"
            >
              <AppImage source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
              {opening === photo.id ? (
                <View style={styles.photoBusy}>
                  <ActivityIndicator color={theme.colors.textSecondary} />
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  } else if (error) {
    body = <ErrorState message={friendlyError(error)} onRetry={() => void refetch()} />;
  } else if (!data || data.days.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>A quiet week</Text>
        <Text style={styles.emptyText}>No new songs or photos on this phone last week.</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={data.days}
        keyExtractor={(d) => d.key}
        renderItem={renderDay}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          <Text style={styles.footer}>
            Read from this phone: your Apple Music library, what you played, and your camera photos. Nothing leaves
            it until you save a moment.
          </Text>
        }
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Last week" subtitle={data ? weekLabel(data.week) : undefined} />
      {body}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing["4xl"] },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing["3xl"], gap: theme.spacing.sm },
    emptyTitle: { ...theme.typography.title, color: theme.colors.text },
    emptyText: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
    day: {
      paddingTop: theme.spacing["2xl"],
      paddingBottom: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    songRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    art: { width: ART, height: ART, borderRadius: theme.radii.sm },
    songText: { flex: 1, gap: 2 },
    songLine: { ...theme.typography.body },
    songTitle: { ...theme.typography.bodyStrong, color: theme.colors.text },
    songArtist: { ...theme.typography.body, color: theme.colors.textSecondary },
    reason: { ...theme.typography.meta, color: theme.colors.textTertiary },
    saved: { ...theme.typography.meta, color: theme.colors.textSecondary },
    photoScroll: { marginHorizontal: -theme.spacing.xl, marginTop: theme.spacing.sm },
    photoStrip: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xs },
    photo: {
      width: PHOTO,
      height: PHOTO,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    photoBusy: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.scrim,
    },
    footer: {
      ...theme.typography.meta,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing["2xl"],
    },
  });
}
