import { useMemo } from "react";
import { ShareMomentSheet } from "@/components/ShareMomentSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useMediaSources } from "@/hooks/useMediaSources";
import { withoutOthersVideos } from "@/lib/linkedMedia";
import { getPublicPhotoUrl } from "@/lib/storage";
import type { MomentCardData } from "@/types";

interface Props {
  moment: MomentCardData;
  visible: boolean;
  onClose: () => void;
  /** The sheet's Add to album row, run once the sheet has closed. */
  onAddToAlbum?: () => void;
}

/**
 * The share sheet for a moment from a list (the Journal's long-press Share).
 * Resolves the photo URLs the way the entry screen does, linked photos from
 * this phone's Photos included, so the share card shows the same images.
 * The sheet itself uploads linked originals before anything leaves
 * (ensureFullMedia in lib/momentShares.ts and lib/albums.ts).
 */
export function MomentShareHost({ moment, visible, onClose, onAddToAlbum }: Props) {
  const { user } = useAuth();
  const shown = useMemo(() => withoutOthersVideos(moment, user?.id), [moment, user?.id]);
  const stored = useMemo(() => shown.photoUrls.map(getPublicPhotoUrl), [shown.photoUrls]);
  const sources = useMediaSources(stored, shown.mediaRefs, shown.userId);
  const photoUrls = useMemo(() => sources.map((s) => s.uri), [sources]);
  return (
    <ShareMomentSheet
      visible={visible}
      moment={moment}
      photoUrls={photoUrls}
      onClose={onClose}
      onAddToAlbum={onAddToAlbum}
    />
  );
}
