import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "@/lib/supabase";
import type { Moment } from "@/types";

const BUCKET = "moment-photos";

const MAX_MOMENT_PHOTO_DIMENSION = 1920;
const MAX_AVATAR_DIMENSION = 400;
const MAX_THUMBNAIL_DIMENSION = 400;

/**
 * The resize for an image of this size to fit within `maxDimension` on its
 * long edge, or null when it already fits. Pure, exported for tests.
 */
export function resizeToFit(
  width: number,
  height: number,
  maxDimension: number
): { width: number } | { height: number } | null {
  if (width <= maxDimension && height <= maxDimension) return null;
  return width >= height ? { width: maxDimension } : { height: maxDimension };
}

/**
 * JPEGs of one image at each size in `maxDimensions` (largest first), from a
 * single decode. Each size is derived from the previous, already-smaller
 * result, so a thumbnail never decodes the full-resolution original again.
 */
async function compressToSizes(uri: string, maxDimensions: number[]): Promise<string[]> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  const refs: { release(): void }[] = [];
  try {
    let image = await context.renderAsync();
    refs.push(image);
    const outputs: string[] = [];
    for (const max of [...maxDimensions].sort((a, b) => b - a)) {
      const resize = resizeToFit(image.width, image.height, max);
      if (resize) {
        context.resize(resize);
        image = await context.renderAsync();
        refs.push(image);
      }
      const saved = await image.saveAsync({
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      outputs.push(saved.uri);
    }
    return outputs;
  } finally {
    // Native bitmaps are held until released; free them now rather than at GC.
    for (const ref of refs) ref.release();
    context.release();
  }
}

async function uploadJpeg(path: string, localUri: string, upsert = false): Promise<void> {
  const file = new File(localUri);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: "image/jpeg", upsert });
  if (error) throw error;
}

/**
 * Upload a photo and a 400px thumbnail. Returns both storage paths. If either
 * upload fails, the other is removed before the error is rethrown, so a
 * half-uploaded photo never lingers in the public bucket.
 */
export async function uploadMomentPhotoWithThumbnail(
  userId: string,
  uri: string
): Promise<{ fullPath: string; thumbnailPath: string }> {
  const uuid = Crypto.randomUUID();
  const fullPath = `${userId}/${uuid}.jpg`;
  const thumbnailPath = `${userId}/thumb_${uuid}.jpg`;

  const [full, thumb] = await compressToSizes(uri, [
    MAX_MOMENT_PHOTO_DIMENSION,
    MAX_THUMBNAIL_DIMENSION,
  ]);
  const results = await Promise.allSettled([
    uploadJpeg(fullPath, full),
    uploadJpeg(thumbnailPath, thumb),
  ]);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    const uploaded = [fullPath, thumbnailPath].filter((_, i) => results[i].status === "fulfilled");
    void deleteMomentPhotos(uploaded);
    throw failed.reason;
  }
  return { fullPath, thumbnailPath };
}

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving order.
 * Settles every item (like Promise.allSettled) so the caller can clean up
 * the ones that succeeded when another failed. Exported for tests.
 */
export async function mapSettledWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Each photo holds a full-resolution bitmap while it's resized; a few at a
// time keeps memory flat on older phones and still overlaps network time.
const PHOTO_UPLOAD_CONCURRENCY = 2;

export interface UploadedMomentPhotos {
  photoPaths: string[];
  thumbnailPaths: string[];
}

/**
 * Upload every photo for a moment, in order. All or nothing: if any photo
 * fails, the ones that did upload are deleted and the first error is thrown,
 * so a failed save leaves nothing behind in the public bucket and a retry
 * starts clean.
 */
export async function uploadMomentPhotos(
  userId: string,
  uris: string[]
): Promise<UploadedMomentPhotos> {
  const results = await mapSettledWithLimit(uris, PHOTO_UPLOAD_CONCURRENCY, (uri) =>
    uploadMomentPhotoWithThumbnail(userId, uri)
  );
  const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    void deleteMomentPhotos(
      uploaded.map((u) => u.fullPath),
      uploaded.map((u) => u.thumbnailPath)
    );
    throw failed.reason;
  }
  return {
    photoPaths: uploaded.map((u) => u.fullPath),
    thumbnailPaths: uploaded.map((u) => u.thumbnailPath),
  };
}

/**
 * Full-size companion of an avatar path (what `profiles.avatar_url` stores).
 * Versioned avatars live at `{uid}/avatar-{ts}.jpg` with the full-size image
 * at `{uid}/avatar-{ts}_full.jpg`; the original fixed `{uid}/avatar.jpg` pairs
 * with `{uid}/avatar_full.jpg`. Avatars uploaded before full-size images
 * existed have no companion, so callers must probe for it.
 */
export function avatarFullPathFor(avatarPath: string): string {
  return avatarPath.replace(/\.jpg$/, "_full.jpg");
}

/**
 * @deprecated Only right for the original fixed-path avatar. Use
 * `avatarFullPathFor(profile.avatarUrl)`, which follows versioned paths.
 */
export function avatarFullPath(userId: string): string {
  return avatarFullPathFor(`${userId}/avatar.jpg`);
}

/** Whether a file name in a user's folder is one of their avatar objects. */
export function isAvatarObjectName(name: string): boolean {
  return /^avatar(-\d+)?(_full)?\.jpg$/.test(name);
}

/**
 * Delete the user's avatar objects except the ones in `keepPaths` (and their
 * full-size companions). Best effort: a failure here leaves an unused file,
 * never a broken avatar.
 */
async function removeStaleAvatars(userId: string, keepPaths: string[]): Promise<void> {
  const keep = new Set(keepPaths.flatMap((p) => [p, avatarFullPathFor(p)]));
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(userId, { search: "avatar", limit: 100 });
  if (error || !data) return;
  const stale = data
    .map((o: { name: string }) => o.name)
    .filter(isAvatarObjectName)
    .map((name: string) => `${userId}/${name}`)
    .filter((path: string) => !keep.has(path));
  if (stale.length === 0) return;
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(stale);
  if (removeError && __DEV__) console.warn("[storage] failed to delete old avatars:", removeError.message);
}

/**
 * Upload an avatar at two sizes: a full-size image for the tap-to-view
 * viewer, and the 400px version that `profiles.avatar_url` points at so every
 * list row and header downloads the small file. Returns the 400px path.
 *
 * Each upload gets a new path, so the URL changes and no image cache or CDN
 * keeps showing the previous picture. Older avatar objects are deleted,
 * except the one the profile still points at until the caller saves the new
 * path (it goes with the next change).
 */
export async function uploadAvatar(
  userId: string,
  uri: string
): Promise<string> {
  const storagePath = `${userId}/avatar-${Date.now()}.jpg`;

  const [full, small] = await compressToSizes(uri, [MAX_MOMENT_PHOTO_DIMENSION, MAX_AVATAR_DIMENSION]);
  const results = await Promise.allSettled([
    uploadJpeg(avatarFullPathFor(storagePath), full),
    uploadJpeg(storagePath, small),
  ]);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    void supabase.storage.from(BUCKET).remove([storagePath, avatarFullPathFor(storagePath)]);
    throw failed.reason;
  }

  // Keep whatever the profile references right now: the caller hasn't saved
  // the new path yet, and if that save fails the old avatar must still load.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (!error) {
    const current = (profile as { avatar_url: string | null } | null)?.avatar_url;
    void removeStaleAvatars(userId, [storagePath, ...(current ? [current] : [])]).catch(() => {});
  }

  return storagePath;
}

/**
 * Return the public URL for a storage path: photos, thumbnails, covers and
 * avatars alike. The moment-photos bucket must be set to public in the
 * Supabase dashboard. No API call needed — the URL is deterministic.
 *
 * Thumbnails are pre-resized to 400px at upload time
 * (uploadMomentPhotoWithThumbnail), so they need no options either —
 * Supabase's on-the-fly transform endpoint is a paid feature and returns 403
 * FeatureNotEnabled on this project.
 */
export function getPublicPhotoUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Image URLs for a moment card's photo strip: the pre-resized thumbnails when
 * the moment has them, otherwise the full-size photos.
 *
 * Extracted from MomentCard because the blank-thumbnail bug in production was
 * URL construction, not rendering — the card asked for a `/render/image/`
 * transform URL, which is a paid Supabase feature this project doesn't have, so
 * storage returned 403 and every card showed an empty frame. That class of bug
 * is testable without a renderer, but only if the URLs are built somewhere a
 * test can call.
 *
 * The fallback is not cosmetic: moments created before thumbnails existed have
 * an empty `photo_thumbnails`, and mapping over it would render nothing at all.
 */
export function momentCardImageUrls(
  moment: Pick<Moment, "photoUrls" | "photoThumbnails">
): string[] {
  const thumbnails = moment.photoThumbnails ?? [];
  if (thumbnails.length > 0) {
    return thumbnails.map((path) => getPublicPhotoUrl(path));
  }
  return (moment.photoUrls ?? []).map((path) => getPublicPhotoUrl(path));
}

/**
 * Delete photo objects for a moment (full-size paths and their thumbnails).
 *
 * The bucket is public and paths are deterministic, so an object left behind
 * after its row is gone stays readable by anyone who saw the URL — deleting
 * the row is not enough. Fire-and-forget by design: the DB delete is the
 * user-visible operation, and a storage failure shouldn't block or fail it.
 * Returns the paths it attempted so callers can log/report if they want.
 */
export async function deleteMomentPhotos(
  photoPaths: string[],
  thumbnailPaths: string[] = []
): Promise<string[]> {
  const paths = [...new Set([...photoPaths, ...thumbnailPaths])].filter(Boolean);
  if (paths.length === 0) return [];
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error && __DEV__) console.warn("[storage] failed to delete photos:", error.message);
  return paths;
}

export async function uploadAlbumCover(
  userId: string,
  collectionId: string,
  uri: string
): Promise<string> {
  const [compressed] = await compressToSizes(uri, [MAX_MOMENT_PHOTO_DIMENSION]);
  const storagePath = `${userId}/collection_covers/${collectionId}.jpg`;
  await uploadJpeg(storagePath, compressed, true);

  return storagePath;
}
