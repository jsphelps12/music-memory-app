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

/**
 * The typed failures delete-guest-moments reports in its JSON body, mapped to
 * messages friendlyError() recognises.
 */
export function guestDeleteErrorMessage(body: unknown): string | null {
  const code = (body as { error?: unknown } | null)?.error;
  if (code === "forbidden") return "permission denied";
  if (code === "not_found") return "no rows found";
  return null;
}

/** On a non-2xx response functions-js puts the Response on `error.context`. */
async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}

/**
 * An album owner removing a guest's contribution. Guest photos live outside
 * the owner's storage folder, so the owner's session can't remove them; the
 * delete-guest-moments edge function removes the photos and then the row with
 * the service role, after checking the caller owns the album. Never delete a
 * guest moment's row from the client: with the row gone there's nothing left
 * to clean the photos up from.
 */
export async function deleteGuestMoment(momentId: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.functions.invoke("delete-guest-moments", {
    body: { momentId },
  });
  if (!error && !data?.error) return { error: null };
  const body = error ? await readFunctionErrorBody(error) : data;
  const message = guestDeleteErrorMessage(body);
  if (message) return { error: new Error(message) };
  return { error: error ?? new Error(String(data?.error ?? "Unknown error")) };
}
