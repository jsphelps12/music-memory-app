import { Directory, File, Paths } from "expo-file-system";
import { keptName, liveUri, storedUri, type AppFolders } from "@/lib/draftPhotos";

/**
 * The files behind moments waiting in the outbox (lib/outbox.ts calls these
 * inside its one-at-a-time storage queue). A queued moment's photos (and a
 * voice recording, when it has one) may sit in a cache folder iOS can clear
 * before the connection comes back, so each queued moment keeps its own
 * copies in the app's documents: Documents/capture-outbox/<user>/<moment>/.
 * Same approach as capture drafts (lib/captureDraftFiles.ts): on APFS a copy
 * is a clone, so it costs next to nothing, and paths are stored relative to
 * the app's folders so an app update that moves the container doesn't
 * strand them. Copies are deleted when their moment saves, is discarded, and
 * on sign-out. Nothing here leaves the phone.
 */

/** Where queued moments' kept copies live, under the document folder. */
export const OUTBOX_FILES_DIR = "capture-outbox";

function folders(): AppFolders {
  return { document: Paths.document.uri, cache: Paths.cache.uri };
}

function userDir(userId: string): Directory {
  return new Directory(Paths.document, OUTBOX_FILES_DIR, userId);
}

/** The stored folder (with trailing slash) for one queued moment's copies. */
function itemFolder(userId: string, itemId: string): string {
  return `doc:${OUTBOX_FILES_DIR}/${userId}/${itemId}/`;
}

/**
 * Copies each file into the queued moment's folder and returns, per source
 * URI, the stored URI to use from now on. A copy that can't be made (the
 * file has already gone, the disk is full) maps to the source as stored, so
 * the save can still try it.
 */
export async function keepOutboxFiles(
  userId: string,
  itemId: string,
  uris: readonly string[]
): Promise<Record<string, string>> {
  const base = folders();
  const folder = itemFolder(userId, itemId);
  const out: Record<string, string> = {};
  for (const uri of uris) {
    const stored = storedUri(uri, base);
    out[uri] = stored;
    if (stored.startsWith(folder)) continue;
    try {
      const source = new File(liveUri(stored, base));
      const dest = new File(liveUri(`${folder}${keptName(stored)}`, base));
      if (!dest.exists) {
        if (!source.exists) continue;
        new Directory(Paths.document, OUTBOX_FILES_DIR, userId, itemId).create({ intermediates: true, idempotent: true });
        await source.copy(dest);
      }
      out[uri] = storedUri(dest.uri, base);
    } catch {}
  }
  return out;
}

/** A stored URI as a file URI in this install's folders. */
export function liveOutboxUri(stored: string): string {
  return liveUri(stored, folders());
}

/** One queued moment's copies (it saved, or was discarded). */
export function deleteOutboxFiles(userId: string, itemId: string): void {
  try {
    const dir = new Directory(Paths.document, OUTBOX_FILES_DIR, userId, itemId);
    if (dir.exists) dir.delete();
  } catch {}
}

/**
 * Deletes folders no queued moment points at any more (the app was closed
 * between a save and deleting its copies).
 */
export function pruneOutboxFiles(userId: string, keepIds: ReadonlySet<string>): void {
  try {
    const dir = userDir(userId);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (!(entry instanceof Directory) || !keepIds.has(entry.name)) entry.delete();
    }
  } catch {}
}

/** Every kept copy for this user (sign-out, account deletion). */
export function deleteAllOutboxFiles(userId: string): void {
  try {
    const dir = userDir(userId);
    if (dir.exists) dir.delete();
  } catch {}
}
