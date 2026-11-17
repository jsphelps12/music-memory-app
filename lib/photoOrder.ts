/**
 * Photo order for the edit screen. The editor shows stored and newly picked
 * photos in one strip the user can reorder (the first is the cover), and the
 * save must write exactly that order. Pure: no I/O, importable from vitest.
 */
import { removedPaths } from "@/lib/momentRow";
import type { MediaRef, MediaRefs } from "@/lib/linkedMedia";

/**
 * One photo in the editor's strip, in on-screen order. A kept photo carries
 * its link to Photos, if any (1.4); a new one its library id, if it came
 * from the library (it will link instead of uploading).
 */
export type EditedPhoto =
  | { kind: "kept"; path: string; thumb: string | null; ref?: MediaRef | null }
  | { kind: "new"; uri: string; assetId?: string | null; durationMs?: number | null };

/** Upload results for the "new" entries, in the order they appear in the list. */
export interface UploadedPhotoPaths {
  photoPaths: string[];
  thumbnailPaths: string[];
}

export interface PhotoColumns {
  photo_urls: string[];
  photo_thumbnails: string[];
  /** One per photo, null where uploaded (lib/linkedMedia.ts). */
  media_refs: MediaRefs;
  /** Storage objects the row no longer references: delete once the update lands. */
  removed: { photos: string[]; thumbnails: string[] };
}

/** Local URIs of the photos to upload, in on-screen order. */
export function newPhotoUris(photos: EditedPhoto[]): string[] {
  return photos.flatMap((p) => (p.kind === "new" ? [p.uri] : []));
}

/** `{uid}/{uuid}.jpg` → `{uid}/thumb_{uuid}.jpg`, the name uploads give a thumbnail. */
function thumbnailNameFor(path: string): string {
  const slash = path.lastIndexOf("/");
  return `${path.slice(0, slash + 1)}thumb_${path.slice(slash + 1)}`;
}

/**
 * Pair a row's stored photos with their thumbnails. Equal-length arrays pair
 * by index. Moments from before thumbnails have none, so every photo gets
 * null. A row whose arrays differ in length (an older edit appended new
 * photos' thumbnails to a moment that had none) can't be paired by index, so
 * each photo takes the thumbnail named after it, if there is one.
 */
export function pairStoredPhotos(
  photoUrls: string[],
  thumbnails: string[]
): Array<{ path: string; thumb: string | null }> {
  if (thumbnails.length === photoUrls.length) {
    return photoUrls.map((path, i) => ({ path, thumb: thumbnails[i] || null }));
  }
  const available = new Set(thumbnails);
  return photoUrls.map((path) => {
    const named = thumbnailNameFor(path);
    return { path, thumb: available.has(named) ? named : null };
  });
}

/**
 * The `photo_urls` / `photo_thumbnails` to write for the editor's list, in its
 * order, with new photos taking their upload results in turn.
 *
 * The two arrays stay index-paired. When no photo has a thumbnail (a moment
 * from before thumbnails, nothing added) thumbnails stay `[]`, which readers
 * treat as "use the full-size photos". When some do, a photo without one uses
 * its full-size path as its thumbnail, so the strip still shows every photo.
 *
 * Throws if the uploads don't cover every new photo: dropping a photo the
 * user added without saying so is worse than failing the save.
 */
export function buildPhotoColumns(
  photos: EditedPhoto[],
  uploaded: UploadedPhotoPaths,
  original: { photos: string[]; thumbnails: string[] },
  /** For each new photo in order: its link when it was linked, else null. */
  newRefs: MediaRefs = []
): PhotoColumns {
  const newCount = photos.filter((p) => p.kind === "new").length;
  if (uploaded.photoPaths.length !== newCount || uploaded.thumbnailPaths.length !== newCount) {
    throw new Error(
      `Photo upload incomplete: ${uploaded.photoPaths.length} of ${newCount} photos uploaded`
    );
  }

  let next = 0;
  const entries = photos.map((p) => {
    if (p.kind === "kept") return { path: p.path, thumb: p.thumb, ref: p.ref ?? null };
    const i = next++;
    return {
      path: uploaded.photoPaths[i],
      thumb: uploaded.thumbnailPaths[i] as string | null,
      ref: newRefs[i] ?? null,
    };
  });

  const photoUrls = entries.map((e) => e.path);
  const photoThumbnails = entries.some((e) => e.thumb)
    ? entries.map((e) => e.thumb || e.path)
    : [];

  return {
    photo_urls: photoUrls,
    photo_thumbnails: photoThumbnails,
    media_refs: entries.map((e) => e.ref),
    removed: {
      photos: removedPaths(original.photos, photoUrls),
      thumbnails: removedPaths(original.thumbnails, photoThumbnails),
    },
  };
}
