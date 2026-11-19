import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { AlbumPicker } from "@/components/AlbumPicker";
import { CreateAlbumSheet } from "@/components/CreateAlbumSheet";
import { addMomentsToAlbum, fetchAlbums } from "@/lib/albums";
import { invalidateAlbumCaches, invalidateMomentCaches } from "@/lib/cacheInvalidation";
import { friendlyError } from "@/lib/errors";
import type { Album } from "@/types";

interface Props {
  visible: boolean;
  /** The selected moments. */
  momentIds: readonly string[];
  userId: string;
  onClose: () => void;
  /** Done: the host closes this and leaves select mode. */
  onAdded: (album: Album, result: { added: string[]; skipped: string[] }) => void;
}

/**
 * Select mode's Add to album: pick one album (or make one) and every selected
 * moment goes in, skipping those already there. A failure stays in the sheet
 * with the selection kept, so the pick can be retried.
 */
export function SelectionAlbumSheet({ visible, momentIds, userId, onClose, onAdded }: Props) {
  const queryClient = useQueryClient();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  // The album being added to: shown ticked while the add runs.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const createAfterPicker = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setAlbums(await fetchAlbums(userId));
    } catch (e) {
      setLoadError(friendlyError(e));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    setError("");
    setPendingId(null);
    void load();
  }, [visible, load]);

  const addTo = async (album: Album) => {
    if (busyRef.current || momentIds.length === 0) return;
    busyRef.current = true;
    Haptics.selectionAsync();
    setError("");
    setPendingId(album.id);
    let result: { added: string[]; skipped: string[] } | null = null;
    let failure: unknown = null;
    try {
      result = await addMomentsToAlbum(album.id, momentIds, userId);
    } catch (e) {
      failure = e ?? new Error("Failed");
    }
    busyRef.current = false;
    if (!result) {
      setPendingId(null);
      setError(`Couldn't add to “${album.name}”. ${friendlyError(failure)}`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateMomentCaches(queryClient, userId);
    invalidateAlbumCaches(queryClient, userId, album.id);
    onAdded(album, result);
  };

  // New album: the picker hides, New album opens once it's gone, and the new
  // album is filled straight away. Closing New album brings the picker back
  // unless the add has already finished (the host has closed the flow).
  const openCreate = () => {
    if (busyRef.current) return;
    createAfterPicker.current = true;
    setCreating(true);
  };
  const onPickerClosed = () => {
    if (!createAfterPicker.current) return;
    createAfterPicker.current = false;
    setCreateVisible(true);
  };
  const handleCreated = (album: Album) => {
    setAlbums((prev) => [...prev, { ...album, momentCount: album.momentCount ?? 0 }]);
    void addTo(album);
  };

  return (
    <>
      <AlbumPicker
        mode="multi"
        visible={visible && !creating}
        title="Add to album"
        collections={albums}
        selectedIds={pendingId ? [pendingId] : []}
        onToggle={(album) => void addTo(album)}
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
        onClosed={() => setCreating(false)}
      />
    </>
  );
}
