import { supabase } from "@/lib/supabase";
import { deleteMomentPhotos } from "@/lib/storage";
import { markTimelineDeleted } from "@/lib/timelineRefresh";
import type { Moment } from "@/types";

/**
 * Delete a moment row plus everything that must go with it: the storage
 * objects (the bucket is public and URLs are guessable, so orphans stay
 * readable forever) and the timeline stale signal.
 *
 * Callers own the confirmation UI, analytics capture, and query-cache
 * invalidation — those differ per screen.
 */
export async function deleteMomentWithCleanup(
  moment: Pick<Moment, "id" | "photoUrls" | "photoThumbnails">
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("moments").delete().eq("id", moment.id);
  if (error) return { error };

  // Row is gone — now remove the objects, or they stay publicly readable at
  // their deterministic URLs forever.
  void deleteMomentPhotos(moment.photoUrls, moment.photoThumbnails);
  markTimelineDeleted(moment.id);
  return { error: null };
}
