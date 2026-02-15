import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";

const BUCKET = "moment-photos";

/**
 * Upload a photo to Supabase Storage and return the storage path.
 * The path can later be used with createSignedUrl() to display the image.
 */
export async function uploadMomentPhoto(
  userId: string,
  uri: string
): Promise<string> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${userId}/${Crypto.randomUUID()}.${ext}`;

  const file = new File(uri);
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
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

  const file = new File(uri);
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
