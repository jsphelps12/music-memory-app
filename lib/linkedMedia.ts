// Linked photos and video (1.4). A moment can keep a reference to a photo or
// video in the owner's Photos library instead of uploading it: the row's
// `media_refs[i]` lines up with `photo_thumbnails[i]` / `photo_urls[i]`.
// - The thumbnail is always uploaded (lists, the PDF, other devices).
// - Until the moment is shared, `photo_urls[i]` is that thumbnail too; a
//   share uploads the full file and sets `full: true`.
// - On the owner's devices the original shows from Photos (`ph://` + the
//   device's local id for the iCloud id).
// Pure and tested (lib/__tests__/linkedMedia.test.ts). See the migration
// supabase/migrations/20261117000000_moment_media_refs.sql.

export type MediaKind = "photo" | "video";

export interface MediaRef {
  /** PHCloudIdentifier string: the same on every device on the same iCloud Photos. */
  cloudId: string;
  kind: MediaKind;
  durationMs?: number;
  /** The full file is uploaded (the moment was shared). */
  full: boolean;
}

/** One entry per photo; null where the photo is a plain upload. */
export type MediaRefs = (MediaRef | null)[];

function isRef(x: unknown): x is MediaRef {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as MediaRef).cloudId === "string" &&
    ((x as MediaRef).kind === "photo" || (x as MediaRef).kind === "video")
  );
}

/** A row's `media_refs`, one entry per photo, nulls where none (or malformed). */
export function alignRefs(raw: unknown, count: number): MediaRefs {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const r = list[i];
    return isRef(r) ? { ...r, full: r.full === true } : null;
  });
}

/** What to write to `media_refs`: [] when nothing is linked, so plain moments stay plain. */
export function refsColumn(refs: MediaRefs): MediaRefs {
  return refs.some(Boolean) ? refs : [];
}

/** iCloud ids to resolve on this device. */
export function linkedCloudIds(refs: MediaRefs | undefined): string[] {
  return (refs ?? []).flatMap((r) => (r ? [r.cloudId] : []));
}

/** Indexes whose full file isn't uploaded yet (a share uploads them). */
export function needsFullUpload(refs: MediaRefs | undefined): number[] {
  return (refs ?? []).flatMap((r, i) => (r && !r.full ? [i] : []));
}

export interface MediaSource {
  uri: string;
  /** Shown from the owner's Photos library, not storage. */
  fromLibrary: boolean;
  kind: MediaKind;
  durationMs?: number;
}

/**
 * What to show for each photo: the original from Photos when it's linked
 * and found on this device, else the stored file (the full one, or the
 * thumbnail standing in for it).
 */
export function displaySources(
  storedUrls: string[],
  refs: MediaRefs | undefined,
  localIds: Record<string, string>
): MediaSource[] {
  return storedUrls.map((url, i) => {
    const ref = refs?.[i] ?? null;
    const local = ref ? localIds[ref.cloudId] : undefined;
    return {
      uri: local ? `ph://${local}` : url,
      fromLibrary: !!local,
      kind: ref?.kind ?? "photo",
      durationMs: ref?.durationMs,
    };
  });
}
