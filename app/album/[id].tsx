import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  AccessibilityInfo,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { usePostHog } from "posthog-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Theme } from "@/constants/theme";
import { MomentCard, type CardMenuAction } from "@/components/MomentCard";
import { sequenceFromList, setMomentSequence } from "@/lib/momentSequence";
import { MomentShareHost } from "@/components/MomentShareHost";
import { MomentAlbumSheet } from "@/components/MomentAlbumSheet";
import { SelectionAlbumSheet } from "@/components/SelectionAlbumSheet";
import { AlbumShareSheet } from "@/components/AlbumShareSheet";
import { CaptureButton } from "@/components/CaptureButton";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { AlbumMosaic } from "@/components/AlbumMosaic";
import { ErrorState } from "@/components/ErrorState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { confirmSheet } from "@/components/ConfirmSheet";
import { MOODS } from "@/constants/Moods";
import {
  AlbumNotFoundError,
  fetchAlbumDetail,
  markAlbumViewed,
  removeMomentsFromAlbum,
  type AlbumDetail,
} from "@/lib/albums";
import { ALBUM_DETAIL_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { invalidateAlbumCaches, invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { canPassOn } from "@/lib/momentView";
import { canRemoveFromAlbum, removeFromAlbumConfirm } from "@/lib/momentActions";
import {
  albumAddNotice,
  albumRemoveKeptNote,
  bulkRemoveFailedTitle,
  planAlbumSelection,
  pruneSelection,
  selectionTitle,
  toggleSelected,
} from "@/lib/momentSelection";
import { Album, Moment, MomentCardData } from "@/types";
import { pluralMoments } from "@/lib/utils";
import { consumeListNotice } from "@/lib/timelineRefresh";

function groupByMonth(moments: Moment[]): { title: string; data: Moment[] }[] {
  const grouped: Record<string, Moment[]> = {};
  for (const m of moments) {
    const key = m.momentDate
      ? new Date(m.momentDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "No date";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  return Object.entries(grouped).map(([title, data]) => ({ title, data }));
}

const STALE_TIME = ALBUM_DETAIL_STALE;

const ART_SIZE = Math.round(Dimensions.get("window").width * 0.72);
// Room above the cover for the floating controls (a 32pt disc plus air).
const HEADER_CLEARANCE = 52;
// The capture + (60pt) sits 16pt above the home indicator; the list's end
// clears it with air to spare (DESIGN.md: 110 to 120 over a tab bar).
const CAPTURE_LIFT = 16;
const CAPTURE_CLEARANCE = 60 + CAPTURE_LIFT + 24;
const NOTICE_MS = 2_500;

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const queryClient = useQueryClient();

  const allMoods = useMemo(
    () => [...MOODS, ...(profile?.customMoods ?? [])],
    [profile?.customMoods]
  );

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: ["album", id, user?.id],
    queryFn: () => fetchAlbumDetail(id!, user!.id),
    staleTime: STALE_TIME,
    enabled: !!user && !!id,
    // Same single retry as the app default, but not for an album that's gone.
    retry: (failureCount, err) => !(err instanceof AlbumNotFoundError) && failureCount < 1,
  });

  const collection = data?.album ?? null;
  const role = collection?.role;
  const moments = useMemo(() => data?.moments ?? [], [data?.moments]);

  // A failed background refetch keeps the previous data — show a banner, not a full-screen error
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  useEffect(() => {
    if (!data?.album || !user) return;
    // Clearing the unread marker changes the You tab's badge and the "N new"
    // pills on the Albums screen and You's album row — all in other caches,
    // so refresh them.
    // Deliberately no albumId: this screen's own data was just fetched and the
    // viewed marker doesn't affect it.
    markAlbumViewed(id!, user.id, data.album.role)
      .then(() => invalidateAlbumCaches(queryClient, user.id))
      .catch(() => {});
  }, [data?.album?.id]);

  useFocusEffect(useCallback(() => {
    if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
  }, [refetch, dataUpdatedAt]));

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const sections = useMemo(() => groupByMonth(moments), [moments]);
  // Opening a moment hands over the album in the order it's shown, so left
  // and right on the moment flip through it. Read at tap time, so a ref
  // (synced after each commit) rather than a dependency that would re-render
  // every card whenever the album changes.
  const sectionsRef = useRef(sections);
  useLayoutEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);
  const handleOpenMoment = useCallback((item: MomentCardData) => {
    const shown = sectionsRef.current.flatMap((s) => s.data);
    setMomentSequence(sequenceFromList(shown, item.id));
  }, []);

  // The album's face when it has no cover photo: its songs' artwork, the same
  // mosaic the Albums grid shows (it used to be the retired brand gradient).
  const artworks = useMemo(() => {
    const list: string[] = [];
    for (const m of moments) {
      if (m.songArtworkUrl && !list.includes(m.songArtworkUrl)) list.push(m.songArtworkUrl);
      if (list.length === 4) break;
    }
    return list;
  }, [moments]);

  // ── Moments leaving the album ───────────────────────────────────────────
  // Out of this screen's copy at once; the refetch the invalidation starts
  // then confirms it.
  const dropFromAlbum = useCallback((ids: readonly string[]) => {
    if (!userId) return;
    const gone = new Set(ids);
    queryClient.setQueryData<AlbumDetail>(["album", id, userId], (old) => {
      if (!old) return old;
      const left = old.moments.filter((m) => !gone.has(m.id));
      return {
        album: { ...old.album, momentCount: left.length, momentIds: left.map((m) => m.id) },
        moments: left,
      };
    });
  }, [queryClient, id, userId]);

  // The card's own Delete has already deleted it and refreshed the caches.
  const handleCardDeleted = useCallback((deletedId: string) => dropFromAlbum([deletedId]), [dropFromAlbum]);

  /** Takes these moments out of the album. Resolves the error, or null once they're out. */
  const removeIds = useCallback(async (ids: readonly string[]): Promise<unknown> => {
    if (!userId || !id || ids.length === 0) return null;
    try {
      await removeMomentsFromAlbum(id, ids);
    } catch (e) {
      return e ?? new Error("Failed");
    }
    dropFromAlbum(ids);
    invalidateMomentCaches(queryClient, userId);
    invalidateAlbumCaches(queryClient, userId, id);
    posthog?.capture("moments_removed_from_album", { count: ids.length });
    return null;
  }, [userId, id, dropFromAlbum, queryClient, posthog]);

  // ── Select mode ─────────────────────────────────────────────────────────
  // Like the Journal's: taps tick cards, and a bar offers Remove from album
  // (and Add to album when every pick is the viewer's own).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SELECTION);
  const [removing, setRemoving] = useState(false);
  const [bulkAlbumVisible, setBulkAlbumVisible] = useState(false);
  const [notice, setNotice] = useState("");
  // The card menu's sheets, one instance for the whole list. The moment
  // outlives `visible` so a sheet keeps its content while it slides away.
  const [shareMoment, setShareMoment] = useState<MomentCardData | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [albumMomentId, setAlbumMomentId] = useState<string | null>(null);
  const [albumVisible, setAlbumVisible] = useState(false);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(EMPTY_SELECTION);
  }, []);

  // Leaving the screen (or pushing one over it) ends it.
  useFocusEffect(useCallback(() => exitSelect, [exitSelect]));

  // A moment that leaves the album leaves the selection too; with nothing
  // left to select, select mode ends.
  useEffect(() => {
    if (moments.length === 0) {
      exitSelect();
      return;
    }
    setSelected((prev) => pruneSelection(prev, moments.map((m) => m.id)));
  }, [moments, exitSelect]);

  // A brief word left by the screen that just closed (capture from this
  // album, after an offline save: lib/outboxUi.ts).
  useFocusEffect(useCallback(() => {
    const left = consumeListNotice();
    if (left) setNotice(left);
  }, []));

  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(notice);
    const t = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const enterSelect = useCallback((firstId?: string) => {
    Haptics.selectionAsync();
    setNotice("");
    setSelecting(true);
    setSelected(firstId ? new Set([firstId]) : EMPTY_SELECTION);
  }, []);

  const toggleSelect = useCallback((momentId: string) => {
    setSelected((prev) => toggleSelected(prev, momentId));
  }, []);

  const removeOne = useCallback(async (item: MomentCardData) => {
    if (!canRemoveFromAlbum(role, item.userId, userId)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (!(await confirmSheet(removeFromAlbumConfirm(1, item.userId === userId)))) return;
    const err = await removeIds([item.id]);
    if (err) Alert.alert(bulkRemoveFailedTitle(1), friendlyError(err));
  }, [role, userId, removeIds]);

  // The card menu's Share, Add to album, Select and Remove from album.
  const handleMenuAction = useCallback((action: CardMenuAction, item: MomentCardData) => {
    if (action === "select") {
      enterSelect(item.id);
    } else if (action === "share") {
      // Only the owner passes a moment on (the menu offers Share to no one else).
      if (!canPassOn(item, userId)) return;
      Haptics.selectionAsync();
      setShareMoment(item);
      setShareVisible(true);
      posthog?.capture("moment_shared", { song_title: item.songTitle, song_artist: item.songArtist, from: "album_menu" });
    } else if (action === "album") {
      Haptics.selectionAsync();
      setAlbumMomentId(item.id);
      setAlbumVisible(true);
    } else {
      void removeOne(item);
    }
  }, [enterSelect, userId, posthog, removeOne]);

  // The share sheet's own Add to album row, once that sheet has closed.
  const shareToAlbum = useCallback(() => {
    if (!shareMoment) return;
    setAlbumMomentId(shareMoment.id);
    setAlbumVisible(true);
  }, [shareMoment]);

  const plan = useMemo(
    () => planAlbumSelection(selected, moments, userId, (owner) => canRemoveFromAlbum(role, owner, userId)),
    [selected, moments, userId, role]
  );
  const selectedIds = useMemo(() => [...selected], [selected]);

  const handleBulkRemove = useCallback(async () => {
    if (removing || plan.removable.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const base = removeFromAlbumConfirm(plan.removable.length, plan.removableAllOwn);
    const note = albumRemoveKeptNote(plan.kept.length);
    if (!(await confirmSheet(note ? { ...base, message: `${base.message} ${note}` } : base))) return;
    setRemoving(true);
    const err = await removeIds(plan.removable);
    setRemoving(false);
    if (err) {
      // The selection stays, ready to try again.
      Alert.alert(bulkRemoveFailedTitle(plan.removable.length), friendlyError(err));
      return;
    }
    exitSelect();
  }, [removing, plan, removeIds, exitSelect]);

  const handleBulkAdded = useCallback((album: Album, result: { added: string[]; skipped: string[] }) => {
    setBulkAlbumVisible(false);
    exitSelect();
    posthog?.capture("moments_added_to_album", { count: result.added.length, skipped: result.skipped.length, from: "album" });
    setNotice(albumAddNotice(album.name, result.added.length, result.skipped.length));
  }, [exitSelect, posthog]);

  const renderMoment = useCallback(({ item }: { item: Moment }) => (
    <MomentCard
      item={item}
      allMoods={allMoods}
      collectionId={collection?.id}
      collectionRole={role}
      currentUserId={userId}
      onDeleted={handleCardDeleted}
      onMenuAction={handleMenuAction}
      inAlbum
      canRemoveFromAlbum={canRemoveFromAlbum(role, item.userId, userId)}
      selecting={selecting}
      selected={selecting && selected.has(item.id)}
      onToggleSelect={toggleSelect}
      onOpen={handleOpenMoment}
    />
  ), [allMoods, collection?.id, role, userId, handleCardDeleted, handleMenuAction, selecting, selected, toggleSelect, handleOpenMoment]);

  // Floating controls, always visible over the scroll: one disc size for
  // both (they float over the cover and the list). Back shows while the
  // album loads too, so the spinner always has a way out; the album's own
  // actions wait for the album. Adding a moment is the capture + below.
  const floatingControls = (
    <View
      style={[styles.floatingControls, { top: insets.top + theme.spacing.sm }]}
      pointerEvents="box-none"
    >
      <IconButton
        variant="filled"
        name="chevron-back"
        accessibilityLabel="Back"
        onPress={() => router.back()}
      />
      {collection ? (
        <View style={styles.floatingRight}>
          <IconButton
            variant="filled"
            name={collection.role === "owner" ? "settings-outline" : "ellipsis-horizontal"}
            accessibilityLabel={collection.role === "owner" ? "Album settings" : "Album options"}
            onPress={() => setShareSheetVisible(true)}
          />
        </View>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
        {floatingControls}
      </View>
    );
  }

  if (isError && !data) {
    // A missing album won't come back on retry; anything else (offline, a
    // timeout) might.
    if (error instanceof AlbumNotFoundError) {
      return (
        <ErrorState
          message="This album isn't available. It may have been deleted, or you're no longer a member."
          onBack={() => router.back()}
        />
      );
    }
    return (
      <ErrorState message={friendlyError(error)} onRetry={() => refetch()} onBack={() => router.back()} />
    );
  }

  const isShared = collection?.isPublic;
  // Everyone who can open this screen is the owner or a member
  // (fetchAlbumDetail), and members can contribute to shared albums.
  const canAdd = role === "owner" || role === "member";

  const subLine = role === "member" && collection?.ownerName
    ? `by ${collection.ownerName} · ${pluralMoments(moments.length)}`
    : isShared
    ? `Shared · ${pluralMoments(moments.length)}`
    : pluralMoments(moments.length);

  const listHeader = (
    <View style={[styles.listHeader, { paddingTop: insets.top + HEADER_CLEARANCE }]}>
      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {/* Square artwork, lifted (the shadow sits on a wrapper so the
          mosaic's clipping doesn't cut it off) */}
      <View style={styles.artLift}>
        <AlbumMosaic
          coverPhotoPath={collection?.coverPhotoUrl}
          artworks={artworks}
          style={styles.art}
        />
      </View>

      <Text style={styles.collectionTitle} accessibilityRole="header" numberOfLines={3}>
        {collection?.name ?? "Album"}
      </Text>

      <Text style={styles.collectionSub}>{subLine}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMoment}
        extraData={selected}
        renderSectionHeader={({ section: { title } }) => (
          <SectionLabel style={styles.sectionHeader}>{title}</SectionLabel>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="Nothing in this album yet"
            subtitle={isShared ? "Tap + to add the first moment — members can contribute too." : "Tap + to add your first moment to this album."}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + CAPTURE_CLEARANCE }]}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={handleRefresh} tintColor={theme.colors.textSecondary} />
        }
      />

      {/* Select mode's header takes the floating controls' place. */}
      {selecting ? (
        <ScreenHeader
          leading="none"
          title={selectionTitle(selected.size)}
          right={
            <Button
              label="Done"
              variant="text"
              size="pill"
              onPress={exitSelect}
              testID="album-select-done"
            />
          }
          style={styles.selectHeader}
        />
      ) : (
        floatingControls
      )}

      {/* The capture + adds a moment straight into this album. Hidden while
          selecting: the select bar has the bottom to itself. */}
      {collection && canAdd && !selecting ? (
        <CaptureButton
          testID="album-capture"
          accessibilityLabel="Add a moment to this album"
          onPress={() => router.push({ pathname: "/create", params: { collectionId: id! } })}
          style={[styles.capture, { bottom: insets.bottom + CAPTURE_LIFT }]}
        />
      ) : null}

      {selecting ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={[styles.selectBar, { paddingBottom: insets.bottom + theme.spacing.sm }]}
        >
          {/* As the Journal's bar: Add to album, then the destructive one. */}
          <Button
            label="Add to album"
            icon="albums-outline"
            variant="text"
            size="pill"
            // Only a moment's owner can add it to an album.
            disabled={!plan.allOwn || removing}
            onPress={() => setBulkAlbumVisible(true)}
            testID="album-select-bar-album"
          />
          <Button
            label="Remove from album"
            icon="remove-circle-outline"
            variant="text"
            size="pill"
            tone="destructive"
            disabled={plan.removable.length === 0}
            loading={removing}
            onPress={() => void handleBulkRemove()}
            testID="album-select-bar-remove"
          />
        </Animated.View>
      ) : null}

      <View style={[styles.noticeWrap, { bottom: insets.bottom + CAPTURE_LIFT }]} pointerEvents="none">
        {notice ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={styles.notice}>
            <Icon name="checkmark" size={16} color={theme.colors.text} />
            <Text style={styles.noticeText} numberOfLines={2}>{notice}</Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Share sheet */}
      {collection && shareSheetVisible && (
        <AlbumShareSheet
          visible={shareSheetVisible}
          collection={collection}
          onClose={() => setShareSheetVisible(false)}
          onUpdated={(updated) =>
            queryClient.setQueryData(["album", id, user?.id], (old: any) =>
              old ? { ...old, album: updated } : old
            )
          }
          onLeft={() => {
            router.back();
          }}
        />
      )}

      {userId && shareMoment ? (
        <MomentShareHost
          moment={shareMoment}
          visible={shareVisible}
          onClose={() => setShareVisible(false)}
          onAddToAlbum={shareToAlbum}
        />
      ) : null}
      {userId ? (
        <>
          <MomentAlbumSheet
            momentId={albumMomentId}
            visible={albumVisible}
            onClose={() => setAlbumVisible(false)}
            userId={userId}
          />
          <SelectionAlbumSheet
            visible={bulkAlbumVisible}
            momentIds={selectedIds}
            userId={userId}
            onClose={() => setBulkAlbumVisible(false)}
            onAdded={handleBulkAdded}
          />
        </>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    listHeader: {
      alignItems: "center",
      paddingHorizontal: theme.spacing["2xl"],
      paddingBottom: theme.spacing.sm,
    },
    bannerWrap: {
      alignSelf: "stretch",
    },
    // DESIGN.md "Artwork lift": album artwork shown large.
    artLift: {
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.artworkPlaceholder,
      ...theme.shadows.artworkLift,
    },
    art: {
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: theme.radii.md,
    },
    collectionTitle: {
      ...theme.typography.headline,
      color: theme.colors.text,
      textAlign: "center",
      marginTop: theme.spacing["2xl"],
    },
    collectionSub: {
      ...theme.typography.meta,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },
    floatingControls: {
      position: "absolute",
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    floatingRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    // Over the top of the list while selecting: the page, then a hairline.
    selectHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    capture: {
      position: "absolute",
      right: theme.spacing.xl,
    },
    // Select mode's actions along the bottom, where the capture + was.
    selectBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: theme.spacing.lg,
      rowGap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.divider,
    },
    // A brief notice where the select bar was: a raised surface with a
    // hairline edge, no shadow, clear of the capture button.
    noticeWrap: {
      position: "absolute",
      left: theme.spacing.xl,
      right: 100,
      alignItems: "flex-start",
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    noticeText: {
      ...theme.typography.callout,
      color: theme.colors.text,
      flexShrink: 1,
    },
    sectionHeader: {
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xs,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
    },
  });
}
