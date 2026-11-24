import { supabase } from "@/lib/supabase";
import { deleteMomentPhotos } from "@/lib/storage";
import { deleteVoice } from "@/lib/voiceStorage";
import { isMissingColumnError } from "@/lib/optionalColumns";
import { markTimelineDeleted } from "@/lib/timelineRefresh";
import type { Moment, MomentCardData } from "@/types";

/**
 * Delete the row and return the voice recording path it had. Card rows don't
 * carry `voice_path` (it isn't in MOMENT_CARD_COLUMNS), so the delete hands
 * it back rather than every caller reading the row first. On a database
 * without the voice columns yet that select fails before anything is
 * deleted, and the plain delete runs instead.
 */
async function deleteRow(id: string): Promise<{ error: Error | null; voicePaths: string[] }> {
  const first = await supabase.from("moments").delete().eq("id", id).select("voice_path");
  if (!first.error) {
    const rows = (first.data ?? []) as { voice_path?: string | null }[];
    return { error: null, voicePaths: rows.flatMap((r) => (r.voice_path ? [r.voice_path] : [])) };
  }
  if (!isMissingColumnError(first.error)) return { error: first.error, voicePaths: [] };
  const { error } = await supabase.from("moments").delete().eq("id", id);
  return { error, voicePaths: [] };
}

/**
 * Delete a moment row plus everything that must go with it: the storage
 * objects (the photo bucket is public and URLs are guessable, so orphans
 * stay readable forever; the voice recording goes with its moment too) and
 * the timeline stale signal.
 *
 * Callers own the confirmation UI, analytics capture, and query-cache
 * invalidation — those differ per screen.
 */
export async function deleteMomentWithCleanup(
  moment: Pick<MomentCardData, "id" | "photoUrls" | "photoThumbnails"> & Pick<Partial<Moment>, "voicePath">
): Promise<{ error: Error | null }> {
  const { error, voicePaths } = await deleteRow(moment.id);
  if (error) return { error };

  // Row is gone — now remove the objects, or they stay publicly readable at
  // their deterministic URLs forever.
  void deleteMomentPhotos(moment.photoUrls, moment.photoThumbnails);
  void deleteVoice([moment.voicePath, ...voicePaths]);
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
