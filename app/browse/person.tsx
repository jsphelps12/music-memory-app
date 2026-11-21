import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBrowseMetadata, fetchMomentsByIds, fetchPersonMoments } from "@/lib/browse";
import { findPersonGroup, groupPeopleByPerson, type PersonGroup } from "@/lib/people";
import { useFriends } from "@/hooks/useFriends";
import { usePeopleLinks } from "@/hooks/usePeopleLinks";
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
  // `name`: a name as written. `friend`: a friend's id, when Rediscover's
  // People row was a friend with linked names.
  const { name: initialName, friend: initialFriend } = useLocalSearchParams<{ name: string; friend?: string }>();
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const { data: meta = [] } = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });
  const { data: linkData } = usePeopleLinks();
  const { data: friends } = useFriends();

  // One entry per real person: names linked to the same friend are one
  // (lib/people.ts groupPeopleByPerson); everyone else by the name written.
  const groups = useMemo(
    () =>
      groupPeopleByPerson(
        meta,
        linkData?.available ? linkData.links : [],
        friends ? new Set(friends.map((f) => f.otherUserId)) : undefined
      ),
    [meta, linkData, friends]
  );

  const active: PersonGroup = useMemo(() => {
    const picked = pickedKey ? groups.find((g) => g.key === pickedKey) : undefined;
    const name = initialName ?? "";
    return (
      picked ??
      findPersonGroup(groups, { friendId: initialFriend, name }) ?? {
        key: `name:${name}`,
        label: name,
        friendId: null,
        names: name ? [name] : [],
        momentIds: [],
      }
    );
  }, [groups, pickedKey, initialFriend, initialName]);

  // A friend's moments are known by id (any of their names); a plain name is
  // matched on the moment, as before.
  const friendMomentIds = active.friendId ? active.momentIds : null;
  const plainName = active.friendId ? "" : active.key.slice("name:".length);
  const { data: moments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["personMoments", user?.id, active.key, friendMomentIds] as const,
    queryFn: ({ queryKey }) =>
      queryKey[3]
        ? fetchMomentsByIds(queryKey[1]!, queryKey[3])
        : fetchPersonMoments(queryKey[1]!, queryKey[2].slice("name:".length)),
    enabled: !!user && (friendMomentIds ? friendMomentIds.length > 0 : !!plainName),
    staleTime: BROWSE_DRILLDOWN_STALE,
  });

  const allMoods = useMemo(() => [...MOODS, ...(profile?.customMoods ?? [])], [profile?.customMoods]);
  // Only from loaded moments: none while loading, after a failed first load,
  // or for someone with no moments.
  const soundtrack = useMemo(() => (moments ? personSoundtrack(moments, allMoods) : null), [moments, allMoods]);
  const showHeader = !!soundtrack && !!(soundtrack.artists || soundtrack.moods);

  // Once per visit, the first time the header has something to show. Whether
  // the person is a linked friend, never who.
  const posthog = usePostHog();
  const headerLogged = useRef(false);
  const linkedFriend = !!active.friendId;
  useEffect(() => {
    if (!showHeader || headerLogged.current) return;
    headerLogged.current = true;
    posthog?.capture("person_soundtrack_viewed", { linked_friend: linkedFriend });
  }, [showHeader, linkedFriend, posthog]);

  return (
    <BrowseScreen
      title={`With ${active.label}`}
      items={groups.map((g) => ({ key: g.key, label: g.label }))}
      activeKey={active.key}
      onSelect={setPickedKey}
      moments={moments ?? []}
      isLoading={isLoading}
      error={isError ? friendlyError(error) : null}
      onRetry={() => refetch()}
      summary={soundtrack?.summary}
      header={showHeader && soundtrack ? <SoundtrackHeader soundtrack={soundtrack} /> : null}
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
