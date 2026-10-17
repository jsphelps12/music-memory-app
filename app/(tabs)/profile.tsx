import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  RefreshControl,
  Linking,
  Dimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppImage } from "@/components/AppImage";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { AlbumMosaic } from "@/components/AlbumMosaic";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import { IconButton } from "@/components/IconButton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useAuth } from "@/contexts/AuthContext";
import type { ProviderSwitchResult } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl, avatarFullPath } from "@/lib/storage";
import { fetchAlbums, fetchAlbumArtworks, fetchSharedAlbumActivity } from "@/lib/albums";
import { fetchSharedWithMe } from "@/lib/momentShares";
import { setCachedMoment } from "@/lib/momentCache";
import { spotifyFailureMessage, SPOTIFY_FREE_NOTICE } from "@/lib/providers/spotifyErrors";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";
import { PROFILE_STATS_STALE } from "@/lib/queryConfig";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { Album, Moment } from "@/types";

// Phase 1 (2026-10): You is about your stuff, not a stats dashboard. A quiet
// header, what friends sent you, your albums as artwork, then friends and
// the music service. Every setting moved behind the gear (app/settings.tsx).

const STALE_TIME = PROFILE_STATS_STALE;
const SHARED_PREVIEW = 3;
const ALBUM_PREVIEW = 4;
const ALBUM_GAP = 14;
// Two columns inside the 20pt gutters.
const ALBUM_CELL = (Dimensions.get("window").width - 40 - ALBUM_GAP) / 2;

async function fetchYouSummary(userId: string) {
  const [{ count: entryCount, error }, { count: friendCount }] = await Promise.all([
    supabase.from("moments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted"),
  ]);
  if (error) throw error;
  return { entryCount: entryCount ?? 0, friendCount: friendCount ?? 0 };
}

async function fetchYouAlbums(userId: string) {
  const [albums, activity] = await Promise.all([fetchAlbums(userId), fetchSharedAlbumActivity(userId)]);
  // Newest activity first isn't tracked per album, so lead with ones that
  // have something new, then the most recently made.
  const newCounts = Object.fromEntries(activity.map((a) => [a.collectionId, a.newMomentCount]));
  const sorted = [...albums].sort(
    (a, b) =>
      (newCounts[b.id] ?? 0) - (newCounts[a.id] ?? 0) ||
      b.createdAt.localeCompare(a.createdAt)
  );
  const preview = sorted.slice(0, ALBUM_PREVIEW);
  const artworks = await fetchAlbumArtworks(preview.filter((a) => !a.coverPhotoUrl).map((a) => a.id));
  return { total: albums.length, preview, artworks, newCounts };
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export default function YouScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile, preferredProvider, setPreferredProvider } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  const [newAlbumVisible, setNewAlbumVisible] = useState(false);
  // Connecting to Spotify is a sign-in sheet plus an account check; show it's
  // working and ignore repeat taps until it settles.
  const [switchingProvider, setSwitchingProvider] = useState(false);

  const summary = useQuery({
    queryKey: ["youSummary", user?.id],
    queryFn: () => fetchYouSummary(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });
  const shared = useQuery({
    queryKey: ["sharedWithMe", user?.id],
    queryFn: () => fetchSharedWithMe(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });
  const albums = useQuery({
    queryKey: ["youAlbums", user?.id],
    queryFn: () => fetchYouAlbums(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // `refreshProfile` is not a React Query observer, so it has no staleTime of
  // its own — left ungated it ran a full `profiles` select, an AsyncStorage
  // write and the Sentry/PostHog identify calls on every single tap of the
  // tab. Same cooldown the queries use.
  const lastProfileRefresh = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastProfileRefresh.current > STALE_TIME) {
        lastProfileRefresh.current = now;
        refreshProfile();
      }
      for (const q of [summary, shared, albums]) {
        if (now - q.dataUpdatedAt > STALE_TIME) q.refetch();
      }
      // The query objects change identity every render; their timestamps are
      // what matter here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshProfile, summary.dataUpdatedAt, shared.dataUpdatedAt, albums.dataUpdatedAt])
  );

  // Pull-to-refresh is an explicit ask, so it bypasses the cooldown — but it
  // still stamps it, so the focus effect doesn't repeat the work moments later.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    lastProfileRefresh.current = Date.now();
    refreshProfile();
    await Promise.all([summary.refetch(), shared.refetch(), albums.refetch()]);
    setRefreshing(false);
  }, [refreshProfile, summary, shared, albums]);

  const avatarUri = profile?.avatarUrl ? getPublicPhotoUrl(profile.avatarUrl) : null;
  // URL currently shown in the full-screen viewer; null = closed.
  const [avatarViewerUrl, setAvatarViewerUrl] = useState<string | null>(null);

  // Avatars uploaded before the dual-size change have no avatar_full.jpg, so
  // probe for it (public bucket, one HEAD per tap) and fall back to the 400px
  // file rather than opening a blank viewer.
  const handleAvatarPress = useCallback(async () => {
    if (!user || !avatarUri) {
      router.push("/profile-edit");
      return;
    }
    const fullUrl = getPublicPhotoUrl(avatarFullPath(user.id));
    try {
      const res = await fetch(fullUrl, { method: "HEAD" });
      setAvatarViewerUrl(res.ok ? fullUrl : avatarUri);
    } catch {
      setAvatarViewerUrl(avatarUri);
    }
  }, [user, avatarUri, router]);

  async function switchProvider(type: "apple_music" | "spotify") {
    setSwitchingProvider(true);
    let result: ProviderSwitchResult;
    try {
      result = await setPreferredProvider(type);
    } catch {
      result = { ok: false, reason: "failed" };
    } finally {
      setSwitchingProvider(false);
    }
    posthog.capture("music_provider_switch", {
      to: type,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
      premium: result.ok ? result.premium ?? null : null,
    });
    if (result.ok) {
      if (type === "spotify" && result.premium === false) {
        Alert.alert("Spotify connected", SPOTIFY_FREE_NOTICE);
      }
      return;
    }
    if (result.reason === "apple_denied") {
      Alert.alert("Apple Music", "Couldn't switch to Apple Music. Allow Music access for Soundtracks in Settings.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    if (result.reason === "save_failed") {
      Alert.alert("Music Service", "Couldn't save your choice. Check your connection and try again.");
      return;
    }
    const message = spotifyFailureMessage(result.reason);
    if (message) Alert.alert("Spotify", message);
  }

  const handleMusicService = () => {
    if (switchingProvider) return;
    Haptics.selectionAsync();
    Alert.alert(
      "Music Service",
      `Currently using ${preferredProvider === "spotify" ? "Spotify" : "Apple Music"}.`,
      [
        {
          text: "Apple Music",
          onPress: () => {
            if (preferredProvider !== "apple_music") void switchProvider("apple_music");
          },
        },
        {
          text: "Spotify",
          onPress: () => {
            if (preferredProvider !== "spotify") void switchProvider("spotify");
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const openSharedMoment = (moment: Moment) => {
    setCachedMoment(moment);
    router.push({
      pathname: "/moment/[id]",
      params: { id: moment.id, contributorName: moment.contributorName ?? undefined },
    });
  };

  const openAlbum = (album: Album) => router.push({ pathname: "/album/[id]", params: { id: album.id } });

  const displayName = profile?.displayName || null;
  const initial = (displayName ?? user?.email ?? "?").charAt(0).toUpperCase();
  const since = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        ...(new Date(user.created_at).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
      })
    : null;
  const entryCount = summary.data?.entryCount;
  const subtitle =
    entryCount === undefined
      ? " "
      : `${entryCount} ${entryCount === 1 ? "entry" : "entries"}${since ? ` since ${since}` : ""}`;

  const sharedItems = shared.data ?? [];
  const albumData = albums.data;
  const anyError = summary.isError || shared.isError || albums.isError;
  const firstError = summary.error ?? shared.error ?? albums.error;
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <View style={[styles.outer, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.textSecondary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleAvatarPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={avatarUri ? "View photo" : "Edit profile"}
          >
            {avatarUri ? (
              <AppImage source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerText}
            onPress={() => router.push("/profile-edit")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityHint="Edit profile"
          >
            <Text style={styles.name} numberOfLines={1}>{displayName ?? "Add your name"}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </TouchableOpacity>
          <IconButton
            name="settings-outline"
            onPress={() => router.push("/settings")}
            accessibilityLabel="Settings"
          />
        </View>

        {anyError && !bannerDismissed ? (
          <View style={styles.banner}>
            <ErrorBanner
              message={friendlyError(firstError)}
              onRetry={handleRefresh}
              onDismiss={() => setBannerDismissed(true)}
            />
          </View>
        ) : null}

        {/* Shared with you */}
        {sharedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.eyebrow}>Shared with you</Text>
              <TouchableOpacity onPress={() => router.push("/shared")} hitSlop={10} accessibilityRole="button">
                <Text style={styles.sectionAction}>See all</Text>
              </TouchableOpacity>
            </View>
            {sharedItems.slice(0, SHARED_PREVIEW).map((item, i, arr) => (
              <TouchableOpacity
                key={item.shareId}
                style={[styles.sharedRow, i < arr.length - 1 && styles.rowDivider]}
                onPress={() => openSharedMoment(item.moment)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                {item.moment.songArtworkUrl ? (
                  <AppImage source={{ uri: item.moment.songArtworkUrl }} style={styles.sharedArtwork} />
                ) : (
                  <ArtworkPlaceholder style={styles.sharedArtwork} />
                )}
                <View style={styles.sharedText}>
                  <Text style={styles.sharedTitle} numberOfLines={1}>{item.moment.songTitle}</Text>
                  <Text style={styles.sharedSub} numberOfLines={1}>
                    {item.moment.contributorName ? `From ${item.moment.contributorName} · ` : ""}
                    {formatShortDate(item.sharedAt)}
                  </Text>
                </View>
                {!item.viewedAt ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Albums */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.eyebrow}>Albums</Text>
            <TouchableOpacity onPress={() => setNewAlbumVisible(true)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.sectionAction}>New album</Text>
            </TouchableOpacity>
          </View>
          {albumData && albumData.preview.length > 0 ? (
            <>
              <View style={styles.albumGrid}>
                {albumData.preview.map((album) => {
                  const fresh = albumData.newCounts[album.id] ?? 0;
                  const sub =
                    album.role === "member" && album.ownerName
                      ? `By ${album.ownerName}`
                      : album.isPublic
                      ? `Shared · ${pluralMoments(album.momentCount)}`
                      : pluralMoments(album.momentCount);
                  return (
                    <TouchableOpacity
                      key={album.id}
                      style={styles.albumCell}
                      onPress={() => openAlbum(album)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                    >
                      <AlbumMosaic coverPhotoPath={album.coverPhotoUrl} artworks={albumData.artworks[album.id]} />
                      <View style={styles.albumNameRow}>
                        <Text style={styles.albumName} numberOfLines={1}>{album.name}</Text>
                        {fresh > 0 ? <View style={styles.unreadDot} accessibilityLabel={`${fresh} new`} /> : null}
                      </View>
                      <Text style={styles.albumSub} numberOfLines={1}>{sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {albumData.total > ALBUM_PREVIEW && (
                <TouchableOpacity style={styles.seeAllAlbums} onPress={() => router.push("/albums")} activeOpacity={0.7}>
                  <Text style={styles.sectionAction}>See all {albumData.total} albums</Text>
                </TouchableOpacity>
              )}
            </>
          ) : albumData ? (
            <Text style={styles.emptyNote}>Group entries into albums: a trip, a person, a year.</Text>
          ) : null}
        </View>

        {/* Friends · Music service */}
        <View style={styles.rows}>
          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            onPress={() => router.push("/friends-list")}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>Friends</Text>
            <View style={styles.rowRight}>
              {summary.data ? <Text style={styles.rowDetail}>{summary.data.friendCount}</Text> : null}
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={handleMusicService} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.rowLabel}>Music service</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowDetail}>
                {switchingProvider ? "Connecting…" : preferredProvider === "spotify" ? "Spotify" : "Apple Music"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {user ? (
        <CreateAlbumSheet
          visible={newAlbumVisible}
          userId={user.id}
          onClose={() => {
            setNewAlbumVisible(false);
            queryClient.invalidateQueries({ queryKey: ["youAlbums", user.id] });
          }}
        />
      ) : null}

      <PhotoViewer
        photos={avatarViewerUrl ? [avatarViewerUrl] : []}
        initialIndex={0}
        visible={avatarViewerUrl !== null}
        onClose={() => setAvatarViewerUrl(null)}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingBottom: 120,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingTop: theme.spacing.lg,
      paddingLeft: theme.spacing.xl,
      paddingRight: theme.spacing.md,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    avatarEmpty: {
      backgroundColor: theme.colors.chipBg,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      fontSize: 24,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    headerText: {
      flex: 1,
    },
    name: {
      fontSize: theme.fontSize["2xl"],
      lineHeight: 32,
      fontFamily: theme.fonts.display,
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    banner: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: theme.spacing.lg,
    },
    section: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: 26,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: theme.spacing.sm,
    },
    eyebrow: {
      fontSize: 13,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    sectionAction: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.bodyMedium,
      color: theme.colors.textSecondary,
    },
    sharedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    sharedArtwork: {
      width: 44,
      height: 44,
      borderRadius: 7,
    },
    sharedText: {
      flex: 1,
    },
    sharedTitle: {
      fontSize: 15,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    sharedSub: {
      marginTop: 1,
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    albumGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: ALBUM_GAP,
      marginTop: theme.spacing.xs,
    },
    albumCell: {
      width: ALBUM_CELL,
    },
    albumNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: theme.spacing.sm,
    },
    albumName: {
      flexShrink: 1,
      fontSize: 15,
      fontFamily: theme.fonts.bodySemibold,
      color: theme.colors.text,
    },
    albumSub: {
      fontSize: 13,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    seeAllAlbums: {
      marginTop: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    emptyNote: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
    rows: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: 18,
    },
    row: {
      height: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowLabel: {
      fontSize: theme.fontSize.base,
      fontFamily: theme.fonts.body,
      color: theme.colors.text,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    rowDetail: {
      fontSize: theme.fontSize.sm,
      fontFamily: theme.fonts.body,
      color: theme.colors.textSecondary,
    },
  });
}
