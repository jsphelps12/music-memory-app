// Select mode in the Journal (2026-11): pick several moments, then add them
// to an album or delete them together. Pure, so it's testable; the screen
// keeps the set in state and the network calls live in lib/deleteMoments.ts
// and lib/albums.ts (addMomentsToAlbum).

/** The set with `id` flipped in or out. Always a new set (React state). */
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Only the ids still on screen: a moment deleted elsewhere or dropped by a
 * refresh must not stay counted. Returns the same set when nothing changed,
 * so a state update with it is a no-op.
 */
export function pruneSelection(selected: ReadonlySet<string>, presentIds: Iterable<string>): ReadonlySet<string> {
  if (selected.size === 0) return selected;
  const present = new Set(presentIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (present.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selected;
}

/** The select-mode header: "Select moments" at none, then "N selected". */
export function selectionTitle(count: number): string {
  return count === 0 ? "Select moments" : `${count} selected`;
}

export interface BulkResult {
  succeeded: string[];
  failed: string[];
  /** The first failure, for friendlyError(). */
  firstError: unknown;
}

/**
 * Runs `run` for each id, a few at a time, and sorts the ids by outcome
 * (in the order given). `run` reports failure by returning { error } or by
 * throwing; either way the rest still run.
 */
export async function runEach(
  ids: readonly string[],
  run: (id: string) => Promise<{ error?: unknown } | void>,
  concurrency = 3
): Promise<BulkResult> {
  const outcome = new Map<string, unknown>();
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const res = await run(id);
        outcome.set(id, res && res.error ? res.error : null);
      } catch (e) {
        outcome.set(id, e ?? new Error("Failed"));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker));
  const succeeded: string[] = [];
  const failed: string[] = [];
  let firstError: unknown = null;
  for (const id of ids) {
    const err = outcome.get(id);
    if (err) {
      failed.push(id);
      if (firstError === null) firstError = err;
    } else {
      succeeded.push(id);
    }
  }
  return { succeeded, failed, firstError };
}

/** Which of `momentIds` still need adding: those not already in the album. */
export function planAlbumAdd(
  momentIds: readonly string[],
  alreadyInAlbum: Iterable<string>
): { toAdd: string[]; skipped: string[] } {
  const inAlbum = new Set(alreadyInAlbum);
  const seen = new Set<string>();
  const toAdd: string[] = [];
  const skipped: string[] = [];
  for (const id of momentIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    (inAlbum.has(id) ? skipped : toAdd).push(id);
  }
  return { toAdd, skipped };
}

function moments(n: number): string {
  return n === 1 ? "1 moment" : `${n} moments`;
}

/** The brief notice after a bulk add: “Added 3 moments to “Summer””. */
export function albumAddNotice(albumName: string, added: number, skipped: number): string {
  if (added === 0) return skipped === 1 ? `Already in “${albumName}”` : `All already in “${albumName}”`;
  return `Added ${moments(added)} to “${albumName}”`;
}

/** The alert title when some deletes failed: “Couldn't delete 2 of 5 moments”. */
export function bulkDeleteFailedTitle(failed: number, total: number): string {
  if (total === 1) return "Couldn't delete moment";
  if (failed === total) return `Couldn't delete ${moments(total)}`;
  return `Couldn't delete ${failed} of ${moments(total)}`;
}
