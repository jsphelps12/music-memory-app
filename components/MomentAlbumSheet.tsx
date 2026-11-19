import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import {
  addMomentToAlbum,
  fetchAlbumIdsContainingMoment,
  fetchAlbums,
  removeMomentFromAlbum,
} from "@/lib/albums";
import { invalidateAlbumCaches, invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { friendlyError } from "@/lib/errors";
import type { Album } from "@/types";

interface Props {
  /** The moment whose albums are being changed; null while none is. */
  momentId: string | null;
  visible: boolean;
  onClose: () => void;
  userId: string;
}

/**
 * "Add to album" for one saved moment: the multi-select quick pick, each tick
 * applied as it's tapped (DESIGN.md: quick picks apply on tap, so Done only
 * closes), with New album handed off once the picker has closed and back to
 * the picker after. The same behaviour as the entry screen's Add to album
 * (app/moment/[id].tsx), which still carries its own copy.
 */
export function MomentAlbumSheet({ momentId, visible, onClose, userId }: Props) {
  const queryClient = useQueryClient();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [createVisible, setCreateVisible] = useState(false);
  // Albums with an add or remove in flight: a second tap waits for the first.
  const togglingRef = useRef(new Set<string>());
  const createAfterPicker = useRef(false);
  // New album is up (or the picker is closing for it): the flow isn't over.
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!momentId) return;
    setLoading(true);
    setLoadError("");
    try {
      // Membership from collection_moments, so joined albums tick too.
      const [cols, containing] = await Promise.all([fetchAlbums(userId), fetchAlbumIdsContainingMoment(momentId)]);
      const listed = new Set(cols.map((c) => c.id));
      setAlbums(cols);
      setMemberIds(containing.filter((cid) => listed.has(cid)));
    } catch (e) {
      // Not "No albums yet": that would read as an empty account.
      setLoadError(friendlyError(e));
    }
    setLoading(false);
  }, [momentId, userId]);

  // Fresh every time it opens for a moment (other screens change albums).
  useEffect(() => {
    if (!visible || !momentId) return;
    setError("");
    void load();
  }, [visible, momentId, load]);

  // The tick and the album's count move first; a failure puts both back.
  const setMembership = (albumId: string, member: boolean) => {
    setMemberIds((prev) =>
      member ? (prev.includes(albumId) ? prev : [...prev, albumId]) : prev.filter((cid) => cid !== albumId)
    );
    setAlbums((prev) =>
      prev.map((c) =>
        c.id === albumId && c.momentCount !== undefined
          ? { ...c, momentCount: Math.max(0, c.momentCount + (member ? 1 : -1)) }
          : c
      )
    );
  };

  const setAlbumMember = async (album: Album, add: boolean) => {
    if (!momentId || togglingRef.current.has(album.id)) return;
    togglingRef.current.add(album.id);
    Haptics.selectionAsync();
    setError("");
    setMembership(album.id, add);
    let failure: unknown = null;
    try {
      if (add) await addMomentToAlbum(album.id, momentId, userId);
      else await removeMomentFromAlbum(album.id, momentId);
    } catch (e) {
      failure = e ?? new Error("Failed");
    }
    togglingRef.current.delete(album.id);
    if (failure) {
      setMembership(album.id, !add);
      setError(`Couldn't ${add ? "add to" : "remove from"} “${album.name}”. ${friendlyError(failure)}`);
      return;
    }
    invalidateMomentCaches(queryClient, userId);
    invalidateAlbumCaches(queryClient, userId, album.id);
  };

  const toggle = (album: Album) => void setAlbumMember(album, !memberIds.includes(album.id));

  // New album: the picker closes, the New album sheet opens once it's gone,
  // and closing that (made or not) brings the picker back. `visible` is the
  // host's "this flow is open"; the picker hides while New album is up.
  const openCreate = () => {
    createAfterPicker.current = true;
    setCreating(true);
  };
  const onPickerClosed = () => {
    if (!createAfterPicker.current) return;
    createAfterPicker.current = false;
    setCreateVisible(true);
  };
  const onCreateClosed = () => setCreating(false);

  // The new album arrives ticked: the moment is added to it straight away.
  const handleCreated = (album: Album) => {
    setAlbums((prev) => [...prev, { ...album, momentCount: album.momentCount ?? 0 }]);
    void setAlbumMember(album, true);
  };

  return (
    <>
      <AlbumPicker
        mode="multi"
        visible={visible && !creating}
        title="Add to album"
        collections={albums}
        selectedIds={memberIds}
        onToggle={toggle}
        onClose={onClose}
        onRequestCreate={openCreate}
        onClosed={onPickerClosed}
        error={error}
        loading={loading}
        loadError={loadError}
        onRetry={load}
      />
      <CreateAlbumSheet
        visible={createVisible}
        userId={userId}
        defaultShared={false}
        onCreated={handleCreated}
        onClose={() => setCreateVisible(false)}
        onClosed={onCreateClosed}
      />
    </>
  );
}
