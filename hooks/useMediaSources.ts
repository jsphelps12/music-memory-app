import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { displaySources, linkedCloudIds, type MediaRefs, type MediaSource } from "@/lib/linkedMedia";
import { localIdsFor } from "@/modules/now-playing";

/**
 * What to show for a moment's photos (1.4): the originals from Photos where
 * they're linked and on this device, the stored files otherwise. Until the
 * lookup answers (or without Photos access), the stored files: a linked
 * photo's thumbnail stands in.
 */
export function useMediaSources(storedUrls: string[], refs: MediaRefs | undefined): MediaSource[] {
  const cloudIds = linkedCloudIds(refs);
  const { data: localIds } = useQuery({
    queryKey: ["mediaLocalIds", cloudIds.join(",")],
    queryFn: () => localIdsFor(cloudIds),
    enabled: cloudIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  // Stable while nothing changes, so the hero doesn't restart its cycle.
  return useMemo(() => displaySources(storedUrls, refs, localIds ?? {}), [storedUrls, refs, localIds]);
}
