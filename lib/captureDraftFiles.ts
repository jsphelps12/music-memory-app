import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library/legacy";
import { videoPoster } from "@/modules/now-playing";
import {
  DRAFT_FILES_DIR,
  keptFolder,
  keptName,
  liveUri,
  needsKeptCopy,
  resolveDraftPhotos,
  storedUri,
  type AppFolders,
  type DraftPhoto,
} from "@/lib/draftPhotos";

/**
 * The files behind capture drafts' photos (lib/captureDraft.ts calls these
 * inside its one-at-a-time storage queue). A photo with no library id to find
 * it by again (a camera photo, one shared in) lives in a cache folder iOS may
 * clear, so a draft keeps a copy in the app's documents, one folder per
 * draft: Documents/capture-drafts/<user>/<draft>/. On APFS the copy is a
 * clone, so it costs next to nothing until the original goes. Copies are
 * deleted when their draft goes (saved, discarded, emptied, expired) and on
 * sign-out. Nothing here leaves the phone.
 */

function folders(): AppFolders {
  return { document: Paths.document.uri, cache: Paths.cache.uri };
}

function userDir(userId: string): Directory {
  return new Directory(Paths.document, DRAFT_FILES_DIR, userId);
}

/**
 * One draft's photos as it stores them: a copy kept for each that needs one,
 * every URI relative to the app's folders. A copy that can't be made leaves
 * the item as it was (it may still be there when the draft is continued).
 */
export async function keepDraftPhotos(
  userId: string,
  draftId: string,
  photos: readonly DraftPhoto[]
): Promise<DraftPhoto[]> {
  const base = folders();
  const folder = keptFolder(userId, draftId);
  const out: DraftPhoto[] = [];
  for (const photo of photos) {
    const stored = { ...photo, uri: storedUri(photo.uri, base) };
    if (!needsKeptCopy(stored, folder)) {
      out.push(stored);
      continue;
    }
    try {
      const source = new File(photo.uri);
      const dest = new File(liveUri(`${folder}${keptName(stored.uri)}`, base));
      if (!dest.exists) {
        if (!source.exists) {
          out.push(stored);
          continue;
        }
        new Directory(Paths.document, DRAFT_FILES_DIR, userId, draftId).create({ intermediates: true, idempotent: true });
        await source.copy(dest);
      }
      out.push({ ...photo, uri: storedUri(dest.uri, base) });
    } catch {
      out.push(stored);
    }
  }
  return out;
}

/**
 * Deletes kept copies no draft points at any more: whole folders of drafts
 * that have gone, and photos taken off a draft that's still there.
 */
export function pruneDraftFiles(userId: string, keep: ReadonlyMap<string, ReadonlySet<string>>): void {
  try {
    const dir = userDir(userId);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      const names = entry instanceof Directory ? keep.get(entry.name) : undefined;
      if (!(entry instanceof Directory) || !names) {
        entry.delete();
        continue;
      }
      for (const file of entry.list()) {
        if (!names.has(file.name)) file.delete();
      }
    }
  } catch {}
}

/** Every kept copy for this user (sign-out, account deletion). */
export function deleteDraftFiles(userId: string): void {
  try {
    const dir = userDir(userId);
    if (dir.exists) dir.delete();
  } catch {}
}

const RELINK_TIMEOUT_MS = 15_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A draft's photos as files on this phone, ready for capture's photo strip.
 * A file iOS has cleared comes back from Photos by its library id (a video as
 * a fresh poster frame); one that can't is left out.
 */
export function restoreDraftPhotos(photos: readonly DraftPhoto[]): Promise<DraftPhoto[]> {
  const base = folders();
  return resolveDraftPhotos(photos, {
    live: (stored) => liveUri(stored, base),
    exists: (uri) => {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    },
    relink: async (photo) => {
      if (!photo.assetId) return null;
      if (photo.videoMs != null) {
        const poster = await videoPoster(photo.assetId);
        return poster ? { uri: poster.uri, videoMs: poster.durationMs } : null;
      }
      const info = await withTimeout(
        MediaLibrary.getAssetInfoAsync(photo.assetId, { shouldDownloadFromNetwork: true }),
        RELINK_TIMEOUT_MS
      );
      return info?.localUri ? { uri: info.localUri } : null;
    },
  });
}
