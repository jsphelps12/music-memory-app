import { useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Dimensions,
  RefreshControl,
  Alert,
} from "react-native";
import type { ViewInstance } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useFriends } from "@/hooks/useFriends";
import { Theme } from "@/constants/theme";
import { AlbumMosaic } from "@/components/AlbumMosaic";
import { AlbumShareSheet } from "@/components/AlbumShareSheet";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { confirmSheet } from "@/components/ConfirmSheet";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ErrorState } from "@/components/ErrorState";
import { MomentActionMenu, nativeMenuAction, type MenuAnchor, type MomentMenuItem } from "@/components/MomentActionMenu";
import { PaneSwitcher } from "@/components/PaneSwitcher";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TextField } from "@/components/TextField";
import { ContextMenuView } from "@/modules/context-menu";
import { deleteAlbum, fetchAlbumsOverview, leaveAlbum, renameAlbum, type AlbumsOverview } from "@/lib/albums";
import { invalidateAlbumCaches } from "@/lib/cacheInvalidation";
import { DEFAULT_SCREEN_STALE } from "@/lib/queryConfig";
import { friendlyError } from "@/lib/errors";
import { pluralMoments } from "@/lib/utils";
import { Album } from "@/types";

// The Albums tab (2026-11-20). Yours: albums you made, including ones you've
// invited people into. Shared: albums other people invited you to. Someone
// with no joined albums and no friends sees only Yours, without the switch.
// Long-press a tile for Invite, Rename and Delete (yours) or Leave (shared).

const GRID_GAP = 12;
// The page gutter (theme.spacing.xl), matching ScreenHeader's title.
const SCREEN_PAD = 20;
const CELL_SIZE = (Dimensions.get("window").width - SCREEN_PAD * 2 - GRID_GAP) / 2;

const STALE_TIME = DEFAULT_SCREEN_STALE;
const QUERY_KEY = "collectionsScreen";

type Styles = ReturnType<typeof createStyles>;
type TileAction = "invite" | "rename" | "delete" | "leave";

// ── Album tile ────────────────────────────────────────────────────────────────

function AlbumTile({
  album,
  hasNew,
  artworks,
  onPress,
  onAction,
  styles,
  theme,
}: {
  album: Album;
  hasNew: boolean;
  artworks: string[];
  onPress: (album: Album) => void;
  onAction: (action: TileAction, album: Album) => void;
  styles: Styles;
  theme: Theme;
}) {
  const tileRef = useRef<ViewInstance>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  // Invite, Rename, then the destructive one last (DESIGN.md, Menus). Only
  // the owner can invite or rename; a member can leave.
  const menuItems = useMemo<MomentMenuItem[]>(
    () =>
      album.role === "owner"
        ? [
            { key: "invite", label: "Invite", icon: "person-add-outline", onPress: () => onAction("invite", album) },
            { key: "rename", label: "Rename", icon: "pencil-outline", onPress: () => onAction("rename", album) },
            { key: "delete", label: "Delete", icon: "trash-outline", destructive: true, onPress: () => onAction("delete", album) },
          ]
        : [
            { key: "leave", label: "Leave", icon: "remove-circle-outline", destructive: true, onPress: () => onAction("leave", album) },
          ],
    [album, onAction]
  );
  const nativeActions = useMemo(() => menuItems.map(nativeMenuAction), [menuItems]);
  const onNativeAction = useCallback(
    (e: { nativeEvent: { id: string } }) => {
      menuItems.find((m) => m.key === e.nativeEvent.id)?.onPress();
    },
    [menuItems]
  );

  // Builds without the native menu: anchor the JS menu to the tile.
  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    tileRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  }, []);

  const sub =
    album.role === "member" && album.ownerName
      ? `By ${album.ownerName} · ${pluralMoments(album.momentCount)}`
      : album.isPublic
      ? `Group · ${pluralMoments(album.momentCount)}`
      : pluralMoments(album.momentCount);

  const NativeMenu = ContextMenuView;
  const tile = (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
      onPress={() => onPress(album)}
      onLongPress={NativeMenu ? undefined : handleLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={hasNew ? `${album.name}, new moments` : album.name}
      accessibilityHint="Touch and hold for options"
    >
      <View style={styles.cellArt}>
        <AlbumMosaic coverPhotoPath={album.coverPhotoUrl} artworks={artworks} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.cellNameRow}>
        <Text style={styles.cellName} numberOfLines={1}>
          {album.name}
        </Text>
        {/* New activity is a dot, never a count (DESIGN.md). */}
        {hasNew ? <View style={styles.newDot} /> : null}
      </View>
      <Text style={styles.cellSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );

  return (
    <View ref={tileRef} collapsable={false} style={styles.cell}>
      {NativeMenu ? (
        <NativeMenu
          actions={nativeActions}
          onAction={onNativeAction}
          previewBackgroundColor={theme.colors.background}
          previewRadius={theme.radii.sm}
          previewInset={theme.spacing.sm}
        >
          {tile}
        </NativeMenu>
      ) : (
        tile
      )}
      <MomentActionMenu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)} />
    </View>
  );
}

// ── One pane's grid ───────────────────────────────────────────────────────────

function AlbumGrid({
  albums,
  overview,
  refreshing,
  onRefresh,
  onPress,
  onAction,
  empty,
  styles,
  theme,
}: {
  albums: Album[];
  overview: AlbumsOverview | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (album: Album) => void;
  onAction: (action: TileAction, album: Album) => void;
  empty: ReactElement;
  styles: Styles;
  theme: Theme;
}) {
  const newCounts = overview?.newCounts ?? {};
  const artworks = overview?.artworks ?? {};
  return (
    <FlatList
      data={albums}
      keyExtractor={(album) => album.id}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={albums.length === 0 ? styles.emptyContent : styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.textSecondary} />
      }
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <AlbumTile
          album={item}
          hasNew={(newCounts[item.id] ?? 0) > 0}
          artworks={artworks[item.id] ?? []}
          onPress={onPress}
          onAction={onAction}
          styles={styles}
          theme={theme}
        />
      )}
    />
  );
}

// ── The tab ───────────────────────────────────────────────────────────────────

export default function AlbumsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [newAlbumVisible, setNewAlbumVisible] = useState(false);
  // The album whose invite sheet (components/AlbumShareSheet) is open.
  const [inviteAlbum, setInviteAlbum] = useState<Album | null>(null);
  // The album being renamed, and the name being typed.
  const [renameTarget, setRenameTarget] = useState<Album | null>(null);
  const [renameText, setRenameText] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [renameError, setRenameError] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: () => fetchAlbumsOverview(user!.id),
    staleTime: STALE_TIME,
    enabled: !!user,
  });
  const friends = useFriends();

  // A failed background refetch keeps the albums on screen with a banner;
  // only a failed first load replaces the screen.
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const showBanner = isError && !!data && errorUpdatedAt > bannerDismissedAt;

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - dataUpdatedAt > STALE_TIME) refetch();
    }, [refetch, dataUpdatedAt])
  );

  const albums = useMemo(() => data?.albums ?? [], [data?.albums]);
  const yours = useMemo(() => albums.filter((a) => a.role === "owner"), [albums]);
  const joined = useMemo(() => albums.filter((a) => a.role === "member"), [albums]);
  const joinedHasNew = useMemo(
    () => joined.some((a) => (data?.newCounts[a.id] ?? 0) > 0),
    [joined, data?.newCounts]
  );
  // Nothing anyone could share with you yet: just your own albums.
  const showSwitch = joined.length > 0 || (friends.data?.length ?? 0) > 0;

  const panes = useMemo(
    () => [
      { key: "yours", label: "Yours", testID: "albums-pane-yours" },
      { key: "shared", label: "Shared", dot: joinedHasNew, testID: "albums-pane-shared" },
    ],
    [joinedHasNew]
  );

  const openAlbum = useCallback(
    (album: Album) => router.push({ pathname: "/album/[id]", params: { id: album.id } }),
    [router]
  );

  // Drop an album from the list at once; the refetch confirms it.
  const removeLocally = useCallback(
    (albumId: string) => {
      queryClient.setQueryData<AlbumsOverview>([QUERY_KEY, userId], (old) =>
        old ? { ...old, albums: old.albums.filter((a) => a.id !== albumId) } : old
      );
    },
    [queryClient, userId]
  );

  const replaceLocally = useCallback(
    (updated: Album) => {
      queryClient.setQueryData<AlbumsOverview>([QUERY_KEY, userId], (old) =>
        old ? { ...old, albums: old.albums.map((a) => (a.id === updated.id ? updated : a)) } : old
      );
    },
    [queryClient, userId]
  );

  const confirmDelete = useCallback(
    async (album: Album) => {
      const confirmed = await confirmSheet({
        title: `Delete “${album.name}”?`,
        message: album.isPublic
          ? "It's gone for everyone in it. Moments stay in each person's Journal."
          : "Its moments stay in your Journal.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!confirmed) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await deleteAlbum(album.id);
        removeLocally(album.id);
        invalidateAlbumCaches(queryClient, userId, album.id);
      } catch (e) {
        Alert.alert("Couldn't delete album", friendlyError(e));
      }
    },
    [queryClient, userId, removeLocally]
  );

  const confirmLeave = useCallback(
    async (album: Album) => {
      if (!userId) return;
      const confirmed = await confirmSheet({
        title: `Leave “${album.name}”?`,
        message: "You can rejoin later with the invite link.",
        confirmLabel: "Leave",
        destructive: true,
      });
      if (!confirmed) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await leaveAlbum(album.id, userId);
        removeLocally(album.id);
        invalidateAlbumCaches(queryClient, userId, album.id);
      } catch (e) {
        Alert.alert("Couldn't leave album", friendlyError(e));
      }
    },
    [queryClient, userId, removeLocally]
  );

  const handleTileAction = useCallback(
    (action: TileAction, album: Album) => {
      if (action === "invite") setInviteAlbum(album);
      else if (action === "rename") {
        setRenameText(album.name);
        setRenameError("");
        setRenameTarget(album);
      } else if (action === "delete") void confirmDelete(album);
      else void confirmLeave(album);
    },
    [confirmDelete, confirmLeave]
  );

  const trimmedName = renameText.trim();
  const renameDirty = !!renameTarget && !!trimmedName && trimmedName !== renameTarget.name;
  const saveRename = useCallback(async () => {
    if (!renameTarget || !renameDirty || savingRename) return;
    setSavingRename(true);
    setRenameError("");
    // No finally: the React Compiler skips a component that has one.
    try {
      await renameAlbum(renameTarget.id, trimmedName);
      replaceLocally({ ...renameTarget, name: trimmedName });
      invalidateAlbumCaches(queryClient, userId, renameTarget.id);
      setRenameTarget(null);
    } catch (e) {
      setRenameError(friendlyError(e));
    }
    setSavingRename(false);
  }, [renameTarget, renameDirty, savingRename, trimmedName, replaceLocally, queryClient, userId]);

  const handleNewAlbumClose = useCallback(() => {
    setNewAlbumVisible(false);
    invalidateAlbumCaches(queryClient, userId);
  }, [queryClient, userId]);

  const handleRefresh = useCallback(() => {
    void refetch();
    void friends.refetch();
  }, [refetch, friends]);

  const refreshing = isFetching && !isLoading;

  const header = (
    <ScreenHeader
      leading="none"
      title="Albums"
      right={
        <Button
          label="New album"
          variant="text"
          size="pill"
          onPress={() => setNewAlbumVisible(true)}
          testID="albums-new"
        />
      }
    />
  );

  let body: ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </View>
    );
  } else if (isError && !data) {
    body = <ErrorState message={friendlyError(error)} onRetry={() => refetch()} />;
  } else {
    body = (
      <PaneSwitcher panes={panes} showSwitch={showSwitch} labelsStyle={styles.paneLabels}>
        {[
          <AlbumGrid
            key="yours"
            albums={yours}
            overview={data}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onPress={openAlbum}
            onAction={handleTileAction}
            styles={styles}
            theme={theme}
            empty={
              <EmptyState
                icon="albums-outline"
                title="No albums yet"
                subtitle="Group entries into albums: a trip, a person, a year. Invite friends to add theirs."
                action={{ label: "New album", onPress: () => setNewAlbumVisible(true) }}
              />
            }
          />,
          <AlbumGrid
            key="shared"
            albums={joined}
            overview={data}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onPress={openAlbum}
            onAction={handleTileAction}
            styles={styles}
            theme={theme}
            empty={
              <EmptyState
                icon="people-outline"
                title="Nothing shared yet"
                subtitle="When a friend invites you to an album, it shows up here."
              />
            }
          />,
        ]}
      </PaneSwitcher>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      {showBanner ? (
        <View style={styles.bannerWrap}>
          <ErrorBanner
            message={friendlyError(error)}
            onRetry={() => refetch()}
            onDismiss={() => setBannerDismissedAt(errorUpdatedAt)}
          />
        </View>
      ) : null}

      {body}

      <CreateAlbumSheet visible={newAlbumVisible} onClose={handleNewAlbumClose} userId={userId ?? ""} />

      {inviteAlbum ? (
        <AlbumShareSheet
          visible
          collection={inviteAlbum}
          onClose={() => setInviteAlbum(null)}
          onUpdated={(updated) => {
            setInviteAlbum(updated);
            replaceLocally(updated);
          }}
          onLeft={removeLocally}
        />
      ) : null}

      <BottomSheet
        visible={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="Rename album"
        headerAction="none"
        keyboardAvoiding
      >
        <View style={styles.renameBody}>
          <TextField
            value={renameText}
            onChangeText={setRenameText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveRename}
            maxLength={60}
            accessibilityLabel="Album name"
          />
          {renameError ? <Text style={styles.renameError}>{renameError}</Text> : null}
          <Button
            label="Save"
            onPress={saveRename}
            loading={savingRename}
            disabled={!renameDirty}
            style={styles.renameSave}
          />
          <Button label="Cancel" variant="text" tone="secondary" onPress={() => setRenameTarget(null)} />
        </View>
      </BottomSheet>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    bannerWrap: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: theme.spacing.sm,
    },
    paneLabels: {
      paddingHorizontal: SCREEN_PAD,
      marginTop: theme.spacing.sm,
    },
    listContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing["4xl"],
    },
    emptyContent: {
      flexGrow: 1,
    },
    gridRow: {
      gap: GRID_GAP,
      marginBottom: theme.spacing.xl,
    },
    cell: {
      width: CELL_SIZE,
    },
    pressed: { opacity: 0.8 },
    cellArt: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
      backgroundColor: theme.colors.artworkPlaceholder,
    },
    cellNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: theme.spacing.sm,
    },
    cellName: {
      ...theme.typography.bodyStrong,
      fontSize: theme.fontSize.callout,
      color: theme.colors.text,
      flexShrink: 1,
    },
    newDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent, // design-lint-ignore: the 8px new-activity dot
    },
    cellSub: {
      ...theme.typography.meta,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    renameBody: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.md,
    },
    renameError: {
      ...theme.typography.meta,
      color: theme.colors.destructive,
    },
    renameSave: {
      marginTop: theme.spacing.xs,
    },
  });
}
