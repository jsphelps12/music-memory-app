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
 * Generate a signed URL for a storage path (1 hour expiry).
 */
export async function getSignedPhotoUrl(
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
