// Linked photos (1.4): before a moment leaves its owner (sent to a friend,
// a share link, a shared album), upload the full originals of any photos
// that are only linked, so the recipient (who may not have the app) gets the
// whole memory, not thumbnails. See lib/linkedMedia.ts.

import * as MediaLibrary from "expo-media-library/legacy";
import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { deleteMomentPhotos, uploadMomentFullPhoto } from "@/lib/storage";
import { alignRefs, needsFullUpload, type MediaRefs } from "@/lib/linkedMedia";
import { localIdsFor } from "@/modules/now-playing";

export interface EnsureResult {
  uploaded: number;
  /** Linked photos no longer on this device (deleted, other Apple ID): they keep their thumbnail. */
  missing: number;
}

// One run per moment at a time: two shares started together (the share sheet
// and a friend share, two friends tapped quickly) wait on the same uploads
// instead of each uploading the originals and one set being left unused.
const inFlight = new Map<string, Promise<EnsureResult>>();

/**
 * Uploads the full file of every linked photo in this moment that isn't
 * uploaded yet, and records it. A no-op for plain moments and for moments
 * that aren't the caller's. Throws if an upload or the row update fails (the
 * share should fail and be retried rather than send thumbnails); whatever it
 * uploaded is removed again. Calls for a moment already being handled share
 * that run's result.
 */
export function ensureFullMedia(momentId: string, userId: string): Promise<EnsureResult> {
  const key = `${userId}:${momentId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const run: Promise<EnsureResult> = uploadMissingOriginals(momentId, userId).finally(() => {
    if (inFlight.get(key) === run) inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}

async function uploadMissingOriginals(momentId: string, userId: string): Promise<EnsureResult> {
  const { data: row, error } = await supabase
    .from("moments")
    .select("id, user_id, photo_urls, media_refs")
    .eq("id", momentId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.user_id !== userId) return { uploaded: 0, missing: 0 };

  const photoUrls: string[] = row.photo_urls ?? [];
  const refs: MediaRefs = alignRefs(row.media_refs, photoUrls.length);
  // Videos stay linked (their poster is what's shared) until video upload exists.
  const pending = needsFullUpload(refs).filter((i) => refs[i]?.kind === "photo");
  if (pending.length === 0) return { uploaded: 0, missing: 0 };

  const localIds = await localIdsFor(pending.map((i) => refs[i]!.cloudId));
  const nextUrls = [...photoUrls];
  const nextRefs: MediaRefs = refs.map((r) => (r ? { ...r } : null));
  const fresh: string[] = [];
  let missing = 0;
  try {
    for (const i of pending) {
      const localId = localIds[refs[i]!.cloudId];
      const info = localId ? await MediaLibrary.getAssetInfoAsync(localId).catch(() => null) : null;
      if (!info?.localUri) {
        missing++;
        continue;
      }
      const path = await uploadMomentFullPhoto(userId, info.localUri);
      fresh.push(path);
      nextUrls[i] = path;
      nextRefs[i] = { ...nextRefs[i]!, full: true };
    }
    if (fresh.length === 0) return { uploaded: 0, missing };
    const { data: updated, error: updateError } = await supabase
      .from("moments")
      .update({ photo_urls: nextUrls, media_refs: nextRefs })
      .eq("id", momentId)
      .select("id");
    if (updateError) throw updateError;
    // The moment went away while uploading (deleted): nothing recorded them.
    if (!updated || updated.length === 0) throw new Error("The moment couldn't be updated.");
  } catch (e) {
    // Nothing points at what we just uploaded: don't leave it public.
    if (fresh.length) void deleteMomentPhotos(fresh).catch(() => {});
    Sentry.captureException(e);
    throw e;
  }
  if (missing) Sentry.addBreadcrumb({ category: "media", message: "linked photos missing on device", data: { missing } });
  return { uploaded: fresh.length, missing };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** For a share link: the signed-in owner's linked photos go up first. */
export async function ensureFullMediaForMe(momentId: string): Promise<void> {
  const me = await currentUserId();
  if (me) await ensureFullMedia(momentId, me);
}

/** Adding to an album: only a shared album's members need the originals. */
export async function ensureFullMediaForAlbum(collectionId: string, momentId: string, userId: string): Promise<void> {
  const { data } = await supabase.from("collections").select("is_public").eq("id", collectionId).maybeSingle();
  if (data?.is_public) await ensureFullMedia(momentId, userId);
}

/** An album becoming shared: the caller's moments in it get their originals uploaded. */
export async function ensureFullMediaForAlbumMoments(collectionId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) return;
  const { data } = await supabase
    .from("collection_moments")
    .select("moment_id, moments!inner(user_id)")
    .eq("collection_id", collectionId)
    .eq("moments.user_id", me);
  for (const row of (data ?? []) as { moment_id: string }[]) await ensureFullMedia(row.moment_id, me);
}
