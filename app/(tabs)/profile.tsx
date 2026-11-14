import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-react-native";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useAuth } from "@/contexts/AuthContext";
import type { ProviderSwitchResult } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl, avatarFullPathFor } from "@/lib/storage";
import { fetchAlbumsOverview, selectAlbumsPreview } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { artworkUrlAtSize } from "@/lib/itunes";
import { fetchSharedWithMe } from "@/lib/momentShares";
import { setCachedMoment } from "@/lib/momentCache";
import { spotifyFailureMessage, SPOTIFY_FREE_NOTICE } from "@/lib/providers/spotifyErrors";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";
import { PROFILE_STATS_STALE, DEFAULT_SCREEN_STALE } from "@/lib/queryConfig";
import { useTheme } from "@/hooks/useTheme";
import { Theme, spacing } from "@/constants/theme";
import { Album, Moment } from "@/types";

// Phase 1 (2026-10): You is about your stuff, not a stats dashboard. A quiet
// header, what friends sent you, your albums as artwork, then friends and
// the music service. Every setting moved behind the gear (app/settings.tsx).

const STALE_TIME = PROFILE_STATS_STALE;
const SHARED_PREVIEW = 3;
const ALBUM_PREVIEW = 4;
// The album-art grid is deliberate: albums are shown as their covers, two
// across inside the page gutters.
const ALBUM_GAP = spacing.lg;
const ALBUM_CELL = (Dimensions.get("window").width - spacing.xl * 2 - ALBUM_GAP) / 2;
// A mosaic tile (or a single artwork filling the cell) at 3x, rounded up.
const ALBUM_ARTWORK_PX = Math.ceil((ALBUM_CELL * 3) / 100) * 100;

// BottomSheet's close animation is 220ms; wait a beat past it.
const SHEET_CLOSE_MS = 280;

const MUSIC_SERVICES = [
  { type: "apple_music", label: "Apple Music" },
  { type: "spotify", label: "Spotify" },
] as const;

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
  const [musicSheetVisible, setMusicSheetVisible] = useState(false);

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
  // Shares the Albums screen's query (and cache): the row is a preview of it.
  const albums = useQuery({
    queryKey: ["collectionsScreen", user?.id],
    queryFn: () => fetchAlbumsOverview(user!.id),
    select: (overview) => selectAlbumsPreview(overview, ALBUM_PREVIEW),
    staleTime: DEFAULT_SCREEN_STALE,
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
    if (!user || !avatarUri || !profile?.avatarUrl) {
      router.push("/profile-edit");
      return;
    }
    const fullUrl = getPublicPhotoUrl(avatarFullPathFor(profile.avatarUrl));
    try {
      const res = await fetch(fullUrl, { method: "HEAD" });
      setAvatarViewerUrl(res.ok ? fullUrl : avatarUri);
    } catch {
      setAvatarViewerUrl(avatarUri);
    }
  }, [user, profile, avatarUri, router]);

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
    setMusicSheetVisible(true);
  };

  // A quick pick: tapping a service applies it and closes the sheet. The
  // Spotify sign-in (and any failure alert) follows once the sheet is away.
  const chooseProvider = (type: "apple_music" | "spotify") => {
    setMusicSheetVisible(false);
    if (preferredProvider === type) return;
    Haptics.selectionAsync();
    // Let the sheet's Modal finish closing first: iOS won't present the
    // Spotify sign-in or an alert over a Modal that's mid-dismiss.
    setTimeout(() => void switchProvider(type), SHEET_CLOSE_MS);
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
              <Text style={styles.sectionTitle} accessibilityRole="header">Shared with you</Text>
              <Button
                label="See all"
                variant="text"
                size="pill"
                tone="secondary"
                onPress={() => router.push("/shared")}
              />
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
                  <AppImage source={{ uri: artworkUrlAtSize(item.moment.songArtworkUrl, 132) }} style={styles.sharedArtwork} />
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
            <Text style={styles.sectionTitle} accessibilityRole="header">Albums</Text>
            <Button
              label="New album"
              variant="text"
              size="pill"
              tone="secondary"
              onPress={() => setNewAlbumVisible(true)}
            />
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
                      <AlbumMosaic coverPhotoPath={album.coverPhotoUrl} artworks={albumData.artworks[album.id]?.map((url) => artworkUrlAtSize(url, ALBUM_ARTWORK_PX))} />
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
                <Button
                  label={`See all ${albumData.total} albums`}
                  variant="text"
                  tone="secondary"
                  onPress={() => router.push("/albums")}
                  style={styles.seeAllAlbums}
                />
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
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            onPress={handleMusicService}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>Music service</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowDetail}>
                {switchingProvider ? "Connecting…" : preferredProvider === "spotify" ? "Spotify" : "Apple Music"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomSheet
        visible={musicSheetVisible}
        onClose={() => setMusicSheetVisible(false)}
        title="Music service"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetNote}>
            Where your songs open and play.
          </Text>
          <View style={styles.sheetList}>
            {MUSIC_SERVICES.map(({ type, label }) => {
              const selected = preferredProvider === type;
              return (
                <Pressable
                  key={type}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                  onPress={() => chooseProvider(type)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.sheetRowLabel}>{label}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={theme.colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </BottomSheet>

      {user ? (
        <CreateAlbumSheet
          visible={newAlbumVisible}
          userId={user.id}
          onClose={() => {
            setNewAlbumVisible(false);
            invalidateAlbumCaches(queryClient, user.id);
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
      gap: theme.spacing.md + 2,
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
      ...theme.typography.title,
      fontSize: 24,
      lineHeight: 30,
      color: theme.colors.text,
    },
    headerText: {
      flex: 1,
    },
    name: {
      ...theme.typography.headline,
      fontSize: theme.fontSize["2xl"],
      lineHeight: 32,
      color: theme.colors.text,
    },
    subtitle: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      marginTop: 2,
      color: theme.colors.textSecondary,
    },
    banner: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: theme.spacing.lg,
    },
    section: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: theme.spacing["2xl"],
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xs,
    },
    sectionTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
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
      borderRadius: theme.radii.sm,
    },
    sharedText: {
      flex: 1,
    },
    sharedTitle: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
    },
    sharedSub: {
      ...theme.typography.meta,
      marginTop: 1,
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
      gap: theme.spacing.xs + 2,
      marginTop: theme.spacing.sm,
    },
    albumName: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      flexShrink: 1,
      color: theme.colors.text,
    },
    albumSub: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    seeAllAlbums: {
      marginTop: theme.spacing.sm,
    },
    emptyNote: {
      ...theme.typography.body,
      fontSize: theme.fontSize.sm,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    rows: {
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing["2xl"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    row: {
      height: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowLabel: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs + 2,
    },
    rowDetail: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    pressed: { opacity: 0.6 },
    sheetBody: {
      paddingHorizontal: theme.spacing.xl,
    },
    sheetNote: {
      ...theme.typography.body,
      fontSize: theme.fontSize.callout,
      lineHeight: 21,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    sheetList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    sheetRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    sheetRowLabel: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
  });
}
