import { Directory, File, Paths } from "expo-file-system";
import { liveUri, storedUri, type AppFolders } from "@/lib/draftPhotos";
import { VOICE_FILES_DIR, voiceFileName, voiceFilesToPrune, type LocalVoice } from "@/lib/voice";

/**
 * Voice takes on the phone, before they're saved (lib/voice.ts has the
 * rules). The recorder writes into a cache folder iOS may clear, so a take
 * is copied into the app's documents, Documents/capture-voice/<user>/, where
 * a capture draft can keep it. A take goes when its moment is saved, on
 * Discard or "Start fresh", when it's recorded over or deleted, and on
 * sign-out; one nothing points at any more is pruned after a day. Nothing
 * here leaves the phone.
 */

function folders(): AppFolders {
  return { document: Paths.document.uri, cache: Paths.cache.uri };
}

function voiceDir(userId: string): Directory {
  return new Directory(Paths.document, VOICE_FILES_DIR, userId);
}

/**
 * Keep a finished recording: copy it out of the recorder's cache folder into
 * the takes folder and delete the original. Returns the kept file's URI.
 */
export async function keepVoiceRecording(userId: string, recorderUri: string): Promise<string> {
  const dir = voiceDir(userId);
  dir.create({ intermediates: true, idempotent: true });
  const source = new File(recorderUri);
  const dest = new File(dir, voiceFileName(Date.now()));
  await source.copy(dest);
  try {
    source.delete();
  } catch {}
  return dest.uri;
}

/** Delete a take (or the recorder's file). Best effort. */
export function deleteLocalVoice(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

/** A take as a draft stores it: relative to the app's folders (lib/draftPhotos.ts). */
export function storedDraftVoice(voice: LocalVoice): LocalVoice {
  return { uri: storedUri(voice.uri, folders()), durationMs: voice.durationMs };
}

/** A draft's take as a file on this phone now, or null when it's gone. */
export function restoreDraftVoice(voice: LocalVoice | null | undefined): LocalVoice | null {
  if (!voice) return null;
  try {
    const uri = liveUri(voice.uri, folders());
    return new File(uri).exists ? { uri, durationMs: voice.durationMs } : null;
  } catch {
    return null;
  }
}

/** Delete takes no draft points at once they're past the grace period. */
export function pruneVoiceFiles(userId: string, keep: ReadonlySet<string>): void {
  try {
    const dir = voiceDir(userId);
    if (!dir.exists) return;
    const entries = dir.list();
    const prune = new Set(voiceFilesToPrune(entries.map((e) => e.name), keep, Date.now()));
    for (const entry of entries) {
      if (prune.has(entry.name)) entry.delete();
    }
  } catch {}
}

/** Every take for this user (sign-out, account deletion). */
export function deleteVoiceFiles(userId: string): void {
  try {
    const dir = voiceDir(userId);
    if (dir.exists) dir.delete();
  } catch {}
}
