import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "@/lib/supabase";

const BUCKET = "moment-photos";

const MAX_MOMENT_PHOTO_DIMENSION = 1920;
const MAX_AVATAR_DIMENSION = 400;
const MAX_THUMBNAIL_DIMENSION = 400;

async function compressImage(uri: string, maxDimension: number): Promise<string> {
  const info = await ImageManipulator.manipulateAsync(uri, []);

  const actions: ImageManipulator.Action[] = [];
  if (info.width > maxDimension || info.height > maxDimension) {
    actions.push(
      info.width >= info.height
        ? { resize: { width: maxDimension } }
        : { resize: { height: maxDimension } }
    );
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}

/**
 * Upload a photo and a 400px thumbnail in parallel.
 * Returns both storage paths.
 */
export async function uploadMomentPhotoWithThumbnail(
  userId: string,
  uri: string
): Promise<{ fullPath: string; thumbnailPath: string }> {
  const uuid = Crypto.randomUUID();

  const [fullPath, thumbnailPath] = await Promise.all([
    (async () => {
      const compressed = await compressImage(uri, MAX_MOMENT_PHOTO_DIMENSION);
      const path = `${userId}/${uuid}.jpg`;
      const file = new File(compressed);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, await file.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      return path;
    })(),
    (async () => {
      const thumb = await compressImage(uri, MAX_THUMBNAIL_DIMENSION);
      const path = `${userId}/thumb_${uuid}.jpg`;
      const file = new File(thumb);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, await file.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      return path;
    })(),
  ]);

  return { fullPath, thumbnailPath };
}

/**
 * Upload an avatar image to Supabase Storage, overwriting any previous avatar.
 * Returns the storage path.
 */
export async function uploadAvatar(
  userId: string,
  uri: string
): Promise<string> {
  const storagePath = `${userId}/avatar.jpg`;

  const compressed = await compressImage(uri, MAX_AVATAR_DIMENSION);
  const file = new File(compressed);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  return storagePath;
}

/**
 * Return the public URL for a storage path.
 * The moment-photos bucket must be set to public in the Supabase dashboard.
 * No API call needed — the URL is deterministic.
 */
export function getPublicPhotoUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Public URL for a thumbnail storage path. Thumbnails are pre-resized to 400px
 * at upload time (uploadMomentPhotoWithThumbnail), so this is a plain public
 * URL — Supabase's on-the-fly transform endpoint is a paid feature and returns
 * 403 FeatureNotEnabled on this project.
 */
export function getPublicPhotoThumbnailUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
  const compressed = await compressImage(uri, MAX_MOMENT_PHOTO_DIMENSION);
  const storagePath = `${userId}/collection_covers/${collectionId}.jpg`;

  const file = new File(compressed);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  return storagePath;
}
