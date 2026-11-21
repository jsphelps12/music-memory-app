import { mapLimit } from "@/lib/mapLimit";

/**
 * The photos and videos a capture draft keeps (lib/captureDraft.ts), and the
 * pure rules for keeping their files findable. The file work itself is in
 * lib/captureDraftFiles.ts.
 *
 * A draft keeps each item's file, its Photos library id when it came from the
 * library (so it can still link instead of uploading, and be found again if
 * the file is gone) and, for a video, its length. Nothing here leaves the
 * phone.
 */
export interface DraftPhoto {
  /**
   * Where the file is. Stored drafts hold files inside the app's own folders
   * relative to them ("doc:…", "cache:…"): iOS can move the app's container
   * when the app is updated, and an absolute path would then point nowhere.
   */
  uri: string;
  /** Photos library id: picked from the library, a day photo, a video. */
  assetId?: string | null;
  /** Length in ms when the item is a video (its uri is the poster frame). */
  videoMs?: number | null;
}

/** The app's own folders, as file URIs. */
export interface AppFolders {
  document: string;
  cache: string;
}

/** Where a draft's kept copies live, under the document folder. */
export const DRAFT_FILES_DIR = "capture-drafts";

const PREFIXES = { document: "doc:", cache: "cache:" } as const;

function withSlash(uri: string): string {
  return uri.endsWith("/") ? uri : `${uri}/`;
}

/** A file URI as a plain path, so "/private/var" and "/var" compare equal. */
function plainPath(uri: string): string {
  return uri.replace(/^file:\/\//, "").replace(/^\/private\//, "/");
}

/** A file URI as a draft stores it: relative when it's in one of the app's folders. */
export function storedUri(uri: string, folders: AppFolders): string {
  const path = plainPath(uri);
  for (const key of ["document", "cache"] as const) {
    const base = withSlash(plainPath(folders[key]));
    if (path.startsWith(base)) return `${PREFIXES[key]}${path.slice(base.length)}`;
  }
  return uri;
}

/** A stored URI back as a file URI in this install's folders. */
export function liveUri(stored: string, folders: AppFolders): string {
  for (const key of ["document", "cache"] as const) {
    if (stored.startsWith(PREFIXES[key])) return `${withSlash(folders[key])}${stored.slice(PREFIXES[key].length)}`;
  }
  return stored;
}

/** The stored folder (with trailing slash) for one draft's kept copies. */
export function keptFolder(userId: string, draftId: string): string {
  return `${PREFIXES.document}${DRAFT_FILES_DIR}/${userId}/${draftId}/`;
}

/**
 * The file name a kept copy gets: from the source's URI, so keeping the same
 * photo twice finds the copy already there, and two different photos that
 * happen to share a name (IMG_0001.jpg from two shares) never collide.
 */
export function keptName(sourceUri: string): string {
  let a = 5381;
  let b = 0;
  for (let i = 0; i < sourceUri.length; i++) {
    const c = sourceUri.charCodeAt(i);
    a = ((a << 5) + a + c) >>> 0;
    b = (c + (b << 6) + (b << 16) - b) >>> 0;
  }
  const ext = /\.([A-Za-z0-9]{1,5})(?:[?#].*)?$/.exec(sourceUri)?.[1]?.toLowerCase() ?? "jpg";
  return `${a.toString(36)}${b.toString(36)}.${ext}`;
}

/**
 * Whether an item needs a copy kept with the draft: it has no library id to
 * find it by again (a camera photo, a photo shared in from another app), and
 * isn't already a copy in this draft's folder.
 */
export function needsKeptCopy(photo: DraftPhoto, folder: string): boolean {
  return !photo.assetId && !photo.uri.startsWith(folder);
}

/** Kept copy names per draft id, from the drafts' stored photos (for cleanup). */
export function keptFileNames(
  drafts: readonly { id: string; photos?: readonly DraftPhoto[] }[],
  userId: string
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const d of drafts) {
    const folder = keptFolder(userId, d.id);
    const names = new Set<string>();
    for (const p of d.photos ?? []) {
      if (p.uri.startsWith(folder)) names.add(p.uri.slice(folder.length));
    }
    if (names.size) out.set(d.id, names);
  }
  return out;
}

/** "1 photo", "2 photos", "1 video", "2 photos, 1 video"; "" with none. */
export function photoCountLabel(photos: readonly DraftPhoto[] | undefined): string {
  const list = photos ?? [];
  const videos = list.filter((p) => p.videoMs != null).length;
  const stills = list.length - videos;
  return [
    stills ? `${stills} ${stills === 1 ? "photo" : "photos"}` : "",
    videos ? `${videos} ${videos === 1 ? "video" : "videos"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export interface ResolveDeps {
  /** Stored URI → file URI in this install. */
  live: (stored: string) => string;
  exists: (uri: string) => boolean;
  /** The file is gone: find it again by its library id (null if it can't be). */
  relink: (photo: DraftPhoto) => Promise<{ uri: string; videoMs?: number | null } | null>;
}

/**
 * A draft's photos as files on this phone now, in order. One whose file has
 * gone (iOS clears caches) comes back through its library id; one that has
 * neither is left out, as is a second copy of the same file.
 */
export async function resolveDraftPhotos(photos: readonly DraftPhoto[], deps: ResolveDeps): Promise<DraftPhoto[]> {
  const resolved = await mapLimit(photos, 3, async (photo): Promise<DraftPhoto | null> => {
    const uri = deps.live(photo.uri);
    if (deps.exists(uri)) return { ...photo, uri };
    if (!photo.assetId) return null;
    try {
      const again = await deps.relink(photo);
      return again ? { ...photo, uri: again.uri, videoMs: again.videoMs ?? photo.videoMs ?? null } : null;
    } catch {
      return null;
    }
  });
  const seen = new Set<string>();
  return resolved.filter((p): p is DraftPhoto => {
    if (!p || seen.has(p.uri)) return false;
    seen.add(p.uri);
    return true;
  });
}
