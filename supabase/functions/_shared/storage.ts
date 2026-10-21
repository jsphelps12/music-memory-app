import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "moment-photos";
const PAGE = 100;

export interface RemoveResult {
  removed: number;
  failed: number;
}

/**
 * Delete every object under `prefix` in a bucket (moment-photos unless told
 * otherwise), recursing into folders and paging through listings. Needs the
 * service role.
 *
 * A failed remove() is counted, not retried: the offset steps past entries
 * that are still listed, so every pass makes progress and the loop ends.
 * Callers decide what a non-zero `failed` means (delete-account refuses to
 * delete the user, so the request can be retried).
 */
export async function removeAllUnder(
  admin: SupabaseClient,
  prefix: string,
  bucket: string = BUCKET
): Promise<RemoveResult> {
  const result: RemoveResult = { removed: 0, failed: 0 };
  let offset = 0;

  for (;;) {
    const { data: entries, error: listError } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    if (listError) {
      console.error(`[storage] list failed under ${prefix}:`, listError.message);
      result.failed += 1;
      break;
    }
    if (!entries || entries.length === 0) break;

    // Entries without an `id` are folders (synthetic rows) and are recursed
    // into rather than removed.
    const files = entries.filter((e) => e.id !== null);
    const folders = entries.filter((e) => e.id === null);

    if (files.length > 0) {
      const paths = files.map((f) => `${prefix}/${f.name}`);
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) {
        console.error(`[storage] remove failed under ${prefix}:`, removeError.message);
        result.failed += paths.length;
        // These files stay listed; step past them so the loop ends.
        offset += files.length;
      } else {
        result.removed += paths.length;
      }
    }

    for (const folder of folders) {
      const sub = await removeAllUnder(admin, `${prefix}/${folder.name}`, bucket);
      result.removed += sub.removed;
      result.failed += sub.failed;
      // A folder disappears once it's empty; one that still holds files
      // stays listed, so step past it.
      if (sub.failed > 0) offset += 1;
    }

    if (entries.length < PAGE) break;
    // Everything else on this page is gone, so the next listing at `offset`
    // starts at the first entry not yet seen.
  }

  return result;
}
