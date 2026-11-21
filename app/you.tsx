import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Platform,
  Share,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppImage } from "@/components/AppImage";
import { IconButton } from "@/components/IconButton";
import { BottomSheet } from "@/components/BottomSheet";
import { ListRow } from "@/components/ListRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { INSIGHTS_MIN_MOMENTS, artistHighlights, insightsSummary, journalInsights } from "@/lib/insights";
import { artworkUrlAtSize } from "@/lib/itunes";
import { ArtworkPlaceholder } from "@/components/ArtworkPlaceholder";
import { Icon } from "@/components/Icon";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useAuth } from "@/contexts/AuthContext";
import type { ProviderSwitchResult } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getPublicPhotoUrl, avatarFullPathFor } from "@/lib/storage";
import { friendInviteUrl } from "@/lib/momentShares";
import { spotifyFailureMessage, SPOTIFY_FREE_NOTICE } from "@/lib/providers/spotifyErrors";
import { friendlyError } from "@/lib/errors";
import { PROFILE_STATS_STALE, BROWSE_META_STALE } from "@/lib/queryConfig";
import { fetchBrowseMetadata } from "@/lib/browse";
import { eligibleReviewYears } from "@/lib/yearInReview";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";

// You (2026-11-20): a pushed screen, opened from the avatar on the Journal
// header. A quiet header, your years, friends and the music service. What
// friends sent you lives on the Journal and albums have their own tab. Every
// setting is behind the gear (app/settings.tsx).

const STALE_TIME = PROFILE_STATS_STALE;

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

export default function YouScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile, preferredProvider, setPreferredProvider } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  // Connecting to Spotify is a sign-in sheet plus an account check; show it's
  // working and ignore repeat taps until it settles.
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [musicSheetVisible, setMusicSheetVisible] = useState(false);

  // Shared with Rediscover's archive (same key): which years have a review.
  const browseMeta = useQuery({
    queryKey: ["browseMeta", user?.id],
    queryFn: () => fetchBrowseMetadata(user!.id),
    enabled: !!user,
    staleTime: BROWSE_META_STALE,
  });
  const reviewYears = useMemo(() => {
    const meta = browseMeta.data ?? [];
    return eligibleReviewYears(meta).map((year) => ({
      year,
      count: meta.filter((m) => m.momentDate?.startsWith(String(year))).length,
    }));
  }, [browseMeta.data]);

  const insights = useMemo(
    () => (browseMeta.data && browseMeta.data.length > 0 ? journalInsights(browseMeta.data) : null),
    [browseMeta.data]
  );
  const insightsReady = !!insights && insights.moments >= INSIGHTS_MIN_MOMENTS;
  // Your most-written artists, or until anyone repeats, your latest three.
  const previewArtists = insights ? artistHighlights(insights, 3).artists : [];

  const summary = useQuery({
    queryKey: ["youSummary", user?.id],
    queryFn: () => fetchYouSummary(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });

  // `refreshProfile` is not a React Query observer, so it has no staleTime of
  // its own — left ungated it ran a full `profiles` select, an AsyncStorage
  // write and the Sentry/PostHog identify calls on every visit. Same cooldown
  // the queries use.
  const lastProfileRefresh = useRef(0);
  const { dataUpdatedAt: summaryUpdatedAt, refetch: refetchSummary } = summary;
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastProfileRefresh.current > STALE_TIME) {
        lastProfileRefresh.current = now;
        refreshProfile();
      }
      if (now - summaryUpdatedAt > STALE_TIME) void refetchSummary();
    }, [refreshProfile, summaryUpdatedAt, refetchSummary])
  );

  // Pull-to-refresh is an explicit ask, so it bypasses the cooldown — but it
  // still stamps it, so the focus effect doesn't repeat the work moments later.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    lastProfileRefresh.current = Date.now();
    refreshProfile();
    await refetchSummary();
    setRefreshing(false);
  }, [refreshProfile, refetchSummary]);

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
    // No conditional expression inside the try: the React Compiler skips it.
    let url = avatarUri;
    try {
      const res = await fetch(fullUrl, { method: "HEAD" });
      if (res.ok) url = fullUrl;
    } catch {
      // The 400px file it is.
    }
    setAvatarViewerUrl(url);
  }, [user, profile, avatarUri, router]);

  // Add-by-link is the only way to make a friend (Sharing v2): opening this
  // link makes the two of you friends.
  const friendToken = profile?.friendInviteToken;
  const handleShareFriendLink = useCallback(() => {
    if (!friendToken) return;
    const url = friendInviteUrl(friendToken);
    void Share.share(Platform.OS === "ios" ? { url } : { message: url });
  }, [friendToken]);

  async function switchProvider(type: "apple_music" | "spotify") {
    setSwitchingProvider(true);
    let result: ProviderSwitchResult;
    // No finally: the React Compiler skips a component that has one.
    try {
      result = await setPreferredProvider(type);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    setSwitchingProvider(false);
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
      Alert.alert("Allow Music access", "To switch to Apple Music, allow Music access for Soundtracks in Settings.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    if (result.reason === "save_failed") {
      Alert.alert("Couldn't save your music service", "Check your connection and try again.");
      return;
    }
    const message = spotifyFailureMessage(result.reason);
    if (message) Alert.alert("Couldn't connect Spotify", message);
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

  const displayName = profile?.displayName || null;
  const initial = (displayName ?? user?.email ?? "?").charAt(0).toUpperCase();
  const since = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        ...(new Date(user.created_at).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
      })
    : null;
  const entryCount = summary.data?.entryCount;
  // The count lives in the stats row now; the subtitle just says since when.
  const subtitle =
    entryCount === undefined
      ? " "
      : since
        ? `Here since ${since}`
        : `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;

  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <View style={styles.outer}>
      <ScreenHeader
        leading="back"
        right={
          <IconButton
            name="settings-outline"
            onPress={() => router.push("/settings")}
            accessibilityLabel="Settings"
          />
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing["3xl"] }]}
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
                <Text style={styles.avatarInitial} allowFontScaling={false}>{initial}</Text>
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
            <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
          </TouchableOpacity>
        </View>

        {summary.isError && !bannerDismissed ? (
          <View style={styles.banner}>
            <ErrorBanner
              message={friendlyError(summary.error)}
              onRetry={handleRefresh}
              onDismiss={() => setBannerDismissed(true)}
            />
          </View>
        ) : null}

        {/* Insights: a preview of app/insights.tsx (lib/insights.ts) */}
        {insights ? (
          <Pressable
            style={({ pressed }) => [styles.insights, pressed && insightsReady && styles.pressed]}
            onPress={insightsReady ? () => router.push({ pathname: "/insights" as any, params: { from: "you_preview" } }) : undefined}
            disabled={!insightsReady}
            accessibilityRole={insightsReady ? "button" : undefined}
            accessibilityLabel={insightsReady ? `Insights, ${insightsSummary(insights)}` : undefined}
            accessibilityHint={insightsReady ? "Opens your insights" : undefined}
            testID="you-insights"
          >
            <View style={styles.insightsHead}>
              <Text style={styles.insightsTitle}>Insights</Text>
              {insightsReady ? (
                <View style={styles.seeAll}>
                  <Text style={styles.seeAllText}>See all</Text>
                  <Icon name="chevron-forward" size={14} color={theme.colors.textSecondary} />
                </View>
              ) : null}
            </View>
            <Text style={styles.insightsMeta}>
              {insightsReady ? insightsSummary(insights) : "Insights show up as your journal grows."}
            </Text>
            {insightsReady && previewArtists.length > 0 ? (
              <View style={styles.topArtists} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {[0, 1, 2].map((i) => {
                  const a = previewArtists[i];
                  return (
                    <View key={i} style={styles.topArtist}>
                      {a ? (
                        <>
                          {a.artworkUrl ? (
                            <AppImage
                              source={{ uri: artworkUrlAtSize(a.artworkUrl, 300) }}
                              style={styles.topArt}
                              contentFit="cover"
                            />
                          ) : (
                            <ArtworkPlaceholder style={styles.topArt} />
                          )}
                          <Text style={styles.topName} numberOfLines={1}>{a.name}</Text>
                          <Text style={styles.topCount} numberOfLines={1}>
                            {a.count > 1 ? `${a.count} moments` : a.latestSong || "1 moment"}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {/* Year in review, any year with enough moments */}
        {reviewYears.length > 0 ? (
          <View style={styles.rows}>
            <SectionLabel>Your years</SectionLabel>
            {reviewYears.map(({ year, count }) => (
              <ListRow
                key={year}
                label={`Your ${year} in songs`}
                detail={`${count} moments`}
                onPress={() => router.push(`/year/${year}`)}
              />
            ))}
          </View>
        ) : null}

        {/* Friends · your friend link · Music service */}
        <View style={styles.rows}>
          <ListRow
            label="Friends"
            detail={summary.data ? String(summary.data.friendCount) : undefined}
            onPress={() => router.push("/friends-list")}
          />
          {friendToken ? (
            <ListRow
              label="Share your friend link"
              onPress={handleShareFriendLink}
              accessibilityHint="Anyone who opens it becomes your friend"
            />
          ) : null}
          <ListRow
            label="Music service"
            detail={switchingProvider ? "Connecting…" : preferredProvider === "spotify" ? "Spotify" : "Apple Music"}
            onPress={handleMusicService}
          />
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
            {MUSIC_SERVICES.map(({ type, label }) => (
              <ListRow
                key={type}
                label={label}
                accessory="check"
                selected={preferredProvider === type}
                onPress={() => chooseProvider(type)}
              />
            ))}
          </View>
        </View>
      </BottomSheet>

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
    insights: {
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing["2xl"],
    },
    pressed: {
      opacity: 0.7,
    },
    insightsHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
    },
    insightsTitle: {
      ...theme.typography.title,
      color: theme.colors.text,
    },
    seeAll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    seeAllText: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    insightsMeta: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    topArtists: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    topArtist: {
      flex: 1,
      minWidth: 0,
    },
    topArt: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radii.sm,
    },
    topName: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginTop: theme.spacing.sm,
    },
    topCount: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
    },
    outer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingTop: theme.spacing.xs,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md + 2,
      paddingHorizontal: theme.spacing.xl,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    avatarEmpty: {
      backgroundColor: theme.colors.fill,
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
    // Groups are separated by space (and a SectionLabel when they have one),
    // not a top rule: a rule above an unlabeled group stacked under the
    // previous row's divider and left an empty band between two lines.
    rows: {
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing["2xl"],
    },
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
  });
}
