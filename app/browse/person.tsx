import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchPersonMoments } from "@/lib/browse";
import { BROWSE_META_STALE, BROWSE_DRILLDOWN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { artworkUrlAtSize } from "@/lib/itunes";
import { artistTileDetail, personSoundtrack, type PersonSoundtrack } from "@/lib/personSoundtrack";
import { BrowseScreen } from "@/components/BrowseScreen";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { SectionLabel } from "@/components/SectionLabel";
import { MOODS } from "@/constants/Moods";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// Three tiles share the row; ask for artwork big enough for any of them.
const TILE_ARTWORK_PX = 300;

export default function PersonScreen() {
  const { user, profile } = useAuth();
  const { name: initialName } = useLocalSearchParams<{ name: string }>();
  const [activePerson, setActivePerson] = useState(initialName ?? "");

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });

  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["personMoments", user?.id, activePerson] as const,
    queryFn: ({ queryKey }) => fetchPersonMoments(queryKey[1]!, queryKey[2]),
    enabled: !!user && !!activePerson,
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  const allPeople = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of meta) for (const p of m.people) counts[p] = (counts[p] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [meta]);

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);
  // Only from loaded moments: none while loading, after a failed first load,
  // or for someone with no moments.
  const soundtrack = useMemo(() => (moments ? personSoundtrack(moments, allMoods) : null), [moments, allMoods]);

  return (
    <BrowseScreen
      title={`With ${activePerson}`}
      items={allPeople.map((name) => ({ key: name, label: name }))}
      activeKey={activePerson}
      onSelect={setActivePerson}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
      summary={soundtrack?.summary}
      header={soundtrack && (soundtrack.artists || soundtrack.moods) ? <SoundtrackHeader soundtrack={soundtrack} /> : null}
    />
  );
}

/**
 * "Your soundtrack with <person>" (lib/personSoundtrack.ts): the artists you
 * share as artwork tiles, then the moods you have together as one Meta line.
 * The count line sits under the title. Glanceable, not a dashboard.
 */
function SoundtrackHeader({ soundtrack }: { soundtrack: PersonSoundtrack }) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { artists, moods } = soundtrack;

  return (
    <View style={styles.header} testID="person-soundtrack">
      {artists ? (
        <>
          <SectionLabel>{artists.kind === "repeats" ? "Artists you share" : "Recently together"}</SectionLabel>
          <View style={styles.tiles}>
            {/* Always three slots, so one or two tiles keep the same size. */}
            {[0, 1, 2].map((i) => {
              const a = artists.artists[i];
              if (!a) return <View key={i} style={styles.tile} />;
              const detail = artistTileDetail(a);
              return (
                <Pressable
                  key={a.name}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/artist", params: { name: a.name } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}, ${detail}`}
                  accessibilityHint="Opens the artist"
                >
                  {a.artworkUrl ? (
                    <AppImage
                      source={{ uri: artworkUrlAtSize(a.artworkUrl, TILE_ARTWORK_PX) }}
                      style={styles.art}
                      contentFit="cover"
                    />
                  ) : (
                    <ArtworkPlaceholder style={styles.art} />
                  )}
                  <Text style={styles.name} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={styles.detail} numberOfLines={1}>
                    {detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      {moods ? (
        <Text style={[styles.moods, artists && styles.moodsAfterTiles]} accessibilityLabel={`Moods together: ${moods}`}>
          {moods}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    // Ruled off from the moments below, like the top of a list.
    // Room above the label, like a section label anywhere else (it sits
    // under BrowseScreen's chips, which have no bottom margin of their own).
    header: {
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    tiles: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    tile: {
      flex: 1,
      minWidth: 0,
    },
    pressed: {
      opacity: 0.6,
    },
    art: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.sm,
    },
    name: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginTop: theme.spacing.sm,
    },
    detail: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    moods: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    moodsAfterTiles: {
      marginTop: theme.spacing.lg,
    },
  });
}
