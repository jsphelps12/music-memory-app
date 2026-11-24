import { File } from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { SIGNED_URL_SECONDS, VOICE_BUCKET, usableCachedUrl, voicePathFor, type SignedUrlEntry } from "@/lib/voice";

/**
 * Voice recordings in storage: the private `moment-voice` bucket, read only
 * through short-lived signed URLs, and only by their owner (the rules are in
 * lib/voice.ts).
 */

/**
 * Upload a moment's recording. Returns its storage path. Mono AAC in an m4a
 * (about half a megabyte a minute), the same file-to-bytes upload as photos
 * (lib/storage.ts); the bucket takes audio/mp4.
 */
export async function uploadVoice(userId: string, momentId: string, fileUri: string): Promise<string> {
  const path = voicePathFor(userId, momentId);
  const file = new File(fileUri);
  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: "audio/mp4", upsert: false });
  if (error) throw error;
  return path;
}

// Signed URLs by path, so replaying a recording (or opening the moment again)
// doesn't ask for a new one each time. Cleared on sign-out.
const signedUrls = new Map<string, SignedUrlEntry>();

/**
 * A short-lived URL that plays the owner's recording (the bucket is private,
 * and only the owner can create one). Throws when it can't be had.
 */
export async function signedVoiceUrl(path: string): Promise<string> {
  const cached = usableCachedUrl(signedUrls.get(path), Date.now());
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL for the recording");
  signedUrls.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 });
  return data.signedUrl;
}

/** Forget every signed URL (sign-out). */
export function clearVoiceUrlCache(): void {
  signedUrls.clear();
}

/**
 * Delete recordings from storage. Best effort, like deleteMomentPhotos: the
 * row is what the person sees go, and a file left behind here is one only its
 * owner could ever read. Never rejects; returns the paths it tried.
 */
export async function deleteVoice(paths: (string | null | undefined)[]): Promise<string[]> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return [];
  for (const p of unique) signedUrls.delete(p);
  try {
    const { error } = await supabase.storage.from(VOICE_BUCKET).remove(unique);
    if (error && __DEV__) console.warn("[voice] failed to delete recordings:", error.message);
  } catch (e) {
    if (__DEV__) console.warn("[voice] failed to delete recordings:", e);
  }
  return unique;
}
