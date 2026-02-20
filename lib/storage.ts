import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "@/lib/supabase";

const BUCKET = "moment-photos";

const MAX_MOMENT_PHOTO_DIMENSION = 1920;
const MAX_AVATAR_DIMENSION = 400;

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
 * Upload a photo to Supabase Storage and return the storage path.
 * The path can later be used with createSignedUrl() to display the image.
 */
export async function uploadMomentPhoto(
  userId: string,
  uri: string
): Promise<string> {
  const compressed = await compressImage(uri, MAX_MOMENT_PHOTO_DIMENSION);
  const storagePath = `${userId}/${Crypto.randomUUID()}.jpg`;

  const file = new File(compressed);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) throw error;

  return storagePath;
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
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}
