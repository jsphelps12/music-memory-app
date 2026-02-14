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

const CACHE_TTL_MS = 3000 * 1000; // 50 minutes
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Generate a signed URL for a storage path (1 hour expiry).
 * Results are cached in memory for 50 minutes to avoid redundant API calls.
 */
export async function getSignedPhotoUrl(
  path: string
): Promise<string | null> {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data.signedUrl;
}
