import { deleteMomentWithCleanup } from "@/lib/deleteMoment";
import { runEach, type BulkResult } from "@/lib/momentSelection";
import type { MomentCardData } from "@/types";

type Deletable = Pick<MomentCardData, "id" | "photoUrls" | "photoThumbnails">;

/**
 * Select mode's Delete: each moment through the same path as a single delete
 * (row, then its storage objects, then the timeline signal), a few at a
 * time. One failing doesn't stop the rest; the result says which went.
 * Callers own the confirm, the player, analytics and cache invalidation, as
 * with deleteMomentWithCleanup.
 */
export function deleteMoments(moments: readonly Deletable[]): Promise<BulkResult> {
  const byId = new Map(moments.map((m) => [m.id, m]));
  return runEach([...byId.keys()], (id) => deleteMomentWithCleanup(byId.get(id)!));
}
