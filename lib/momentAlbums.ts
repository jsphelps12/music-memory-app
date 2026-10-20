import { supabase } from "@/lib/supabase";

/**
 * Which albums a moment is in, for the "Add to album" sheet and the share
 * sheet's "Shared with" chips. Read from collection_moments directly: the
 * album list only carries moment ids for albums the user owns, so a shared
 * album the user joined always looked unchecked, and ticking it tried to add
 * the moment a second time.
 *
 * RLS limits the rows to albums the user can see.
 */
export async function fetchAlbumIdsContainingMoment(momentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_moments")
    .select("collection_id")
    .eq("moment_id", momentId);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { collection_id: string }) => r.collection_id))];
}

/** Albums to add the moment to and remove it from, going from `current` to `pending`. */
export function diffAlbumMembership(
  current: readonly string[],
  pending: readonly string[]
): { toAdd: string[]; toRemove: string[] } {
  return {
    toAdd: pending.filter((id) => !current.includes(id)),
    toRemove: current.filter((id) => !pending.includes(id)),
  };
}

export interface MembershipChangeResult {
  /** Membership after the calls that succeeded. */
  memberIds: string[];
  /** Albums whose membership actually changed (their caches need invalidating). */
  changedIds: string[];
  /** The first failure, if any call failed. */
  error: unknown | null;
}

/**
 * Fold the settled add/remove calls back into a membership list, so a partial
 * failure keeps what did save instead of pretending nothing (or everything) did.
 * `results` is in the order of `[...toAdd, ...toRemove]`.
 */
export function applyMembershipResults(
  current: readonly string[],
  toAdd: readonly string[],
  toRemove: readonly string[],
  results: readonly PromiseSettledResult<unknown>[]
): MembershipChangeResult {
  const members = new Set(current);
  const changedIds: string[] = [];
  let error: unknown | null = null;
  const ops: { id: string; add: boolean }[] = [
    ...toAdd.map((id) => ({ id, add: true })),
    ...toRemove.map((id) => ({ id, add: false })),
  ];
  ops.forEach((op, i) => {
    const result = results[i];
    if (result?.status === "fulfilled") {
      if (op.add) members.add(op.id);
      else members.delete(op.id);
      changedIds.push(op.id);
    } else if (error === null) {
      error = result ? result.reason : new Error("Missing result");
    }
  });
  return { memberIds: [...members], changedIds, error };
}
