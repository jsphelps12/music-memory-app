import * as Sentry from "@sentry/react-native";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { getProvider } from "@/lib/providers";
import { uploadMomentPhotos, deleteMomentPhotos, type UploadedMomentPhotos } from "@/lib/storage";
import { addMomentToAlbum } from "@/lib/albums";
import { Song, Album, Moment, type PersonLink } from "@/types";
import { syncMomentPeopleLinks } from "@/lib/momentPeopleLinks";
import { mapRowToMoment } from "@/lib/moments";
import { momentRowFields, songIdentityChanged, type MomentFieldsInput } from "@/lib/momentRow";
import { buildPhotoColumns, newPhotoUris, type EditedPhoto, type PhotoColumns } from "@/lib/photoOrder";
import { refsColumn, type MediaRefs } from "@/lib/linkedMedia";
import { cloudIdsFor } from "@/modules/now-playing";
import { EMPTY_SONG_LOOKUP, songMetadataColumns, type SongLookup } from "@/lib/songMetadata";
import { SONG_METADATA_OPTIONAL_COLUMNS, writeWithOptionalColumns } from "@/lib/optionalColumns";
import type { CaptureSource } from "@/lib/captureSource";

/**
 * Write the moment's "Who was there" links (lib/momentPeopleLinks.ts) after
 * its row is saved. Never fails the save: a missing table (migration not
 * applied yet) is skipped, anything else goes to Sentry and the names stay
 * on the moment as plain text.
 */
async function savePeopleLinks(input: {
  momentId: string;
  ownerId: string;
  people: readonly string[];
  before: readonly PersonLink[];
  after: readonly PersonLink[];
}): Promise<void> {
  try {
    await syncMomentPeopleLinks(input);
  } catch (e) {
    Sentry.captureException(e, { tags: { area: "people_links" } });
  }
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late Night";
}

/**
 * The song's preview and catalog details (genre, release date, ids, length;
 * lib/songMetadata.ts). Never rejects: a failed lookup never fails a save, it
 * just leaves those columns null. Capture starts it when the song is picked
 * and hands the promise in. Providers without catalog details (Spotify) give
 * the preview only.
 */
export function lookupPreview(song: Song): Promise<SongLookup> {
  const provider = getProvider(song.provider);
  const lookup = provider.lookupSong
    ? provider.lookupSong(song)
    : provider.fetchPreviewUrl(song).then((previewUrl) => ({ ...EMPTY_SONG_LOOKUP, previewUrl }));
  return lookup.catch(() => EMPTY_SONG_LOOKUP);
}

export interface SaveMomentInput extends MomentFieldsInput {
  userId: string;
  photos: string[];
  /**
   * Per photo, its Photos library id when it came from the library (picker,
   * suggestion strip, Last week). Those are linked, not uploaded (1.4): only
   * a thumbnail goes up, and the moment keeps the iCloud id.
   */
  photoAssetIds?: (string | null)[];
  /** Per photo, the length in ms when it's a video's poster (1.4): linked, never uploaded. */
  photoVideoDurations?: (number | null)[];
  selectedAlbum?: Album | null;
  /**
   * A preview lookup already started when the song was picked. Pass the
   * promise itself, not its result, so photo uploads don't wait on it.
   */
  prefetchedPreview?: Promise<SongLookup | null> | null;
  weatherResult?: { tempF: number; condition: string } | null;
  /** How the moment was captured (lib/captureSource.ts). */
  captureSource?: CaptureSource | null;
  /** Names in `people` linked to friends (written after the row; never blocks the save). */
  peopleLinks?: PersonLink[];
}

export interface SaveMomentResult {
  id: string;
  moment: Moment;
  secondaryFailures: string[];
}

/**
 * After a write reported an error, read the row back to learn whether it
 * landed anyway (a response can be lost after the database committed).
 * Returns the row, null when it is confirmed absent, or "unknown" when the
 * check itself failed.
 */
async function readBack(id: string): Promise<Record<string, any> | null | "unknown"> {
  const { data, error } = await supabase.from("moments").select("*").eq("id", id).maybeSingle();
  if (error) return "unknown";
  return data ?? null;
}

export async function saveMoment(input: SaveMomentInput): Promise<SaveMomentResult> {
  Sentry.addBreadcrumb({
    category: "moment",
    message: "save_moment started",
    level: "info",
    data: { photoCount: input.photos.length, song: input.song.title, hasAlbum: !!input.selectedAlbum },
  });

  // The preview lookup and the uploads run side by side; neither waits on the other.
  const previewPromise: Promise<SongLookup> = input.prefetchedPreview
    ? input.prefetchedPreview.then((p) => p ?? EMPTY_SONG_LOOKUP).catch(() => EMPTY_SONG_LOOKUP)
    : lookupPreview(input.song);
  // Linked photos: library photos whose iCloud id resolves keep a reference
  // and upload only a thumbnail. Anything else (camera, shared in) uploads.
  const assetIds = input.photoAssetIds ?? [];
  const cloud = await cloudIdsFor(assetIds.filter((id): id is string => !!id));
  const durations = input.photoVideoDurations ?? [];
  const refs: MediaRefs = input.photos.map((_, i) => {
    const cloudId = assetIds[i] ? cloud[assetIds[i]!] : undefined;
    const durationMs = durations[i];
    if (durationMs != null) {
      // A video is only ever linked; without an iCloud id it can't be kept.
      if (!cloudId) throw new Error("A video couldn't be linked to your Photos library. Remove it and try again.");
      return { cloudId, kind: "video", durationMs, full: false };
    }
    return cloudId ? { cloudId, kind: "photo", full: false } : null;
  });
  const [preview, uploaded] = await Promise.all([
    previewPromise,
    uploadMomentPhotos(input.userId, input.photos, refs.map(Boolean)),
  ]);

  Sentry.addBreadcrumb({ category: "moment", message: "preview_url + photos ready", level: "info", data: { photoCount: uploaded.photoPaths.length } });

  // The id is chosen here, not by the database, so a failed insert can be
  // checked: if the row exists after all, the save succeeded.
  const id = Crypto.randomUUID();
  const {
    data: insertedRow,
    error: insertError,
    droppedOptional,
  } = await writeWithOptionalColumns<Record<string, any>>(
    {
      id,
      user_id: input.userId,
      ...momentRowFields(input, preview.albumName),
      song_preview_url: preview.previewUrl,
      // Optional until 20261120120000_song_metadata.sql is applied: dropped
      // and retried once if the database doesn't have them yet.
      ...songMetadataColumns(preview),
      capture_source: input.captureSource ?? null,
      photo_urls: uploaded.photoPaths,
      photo_thumbnails: uploaded.thumbnailPaths,
      media_refs: refsColumn(refs),
      time_of_day: getTimeOfDay(),
      weather_temp_f: input.weatherResult?.tempF ?? null,
      weather_condition: input.weatherResult?.condition ?? null,
      // No visibility write (Social Architecture v2): the column still exists
      // for stranded build-7 binaries and takes its 'private' DB default here.
      // Privacy is the absence of grant rows, not this column.
    },
    SONG_METADATA_OPTIONAL_COLUMNS,
    (row) => supabase.from("moments").insert(row).select("*").single()
  );
  if (droppedOptional) {
    Sentry.addBreadcrumb({ category: "moment", message: "insert retried without song metadata columns", level: "warning" });
  }

  let inserted = insertedRow;
  if (insertError) {
    const existing = await readBack(id);
    if (existing === null) {
      // Confirmed not saved: nothing points at these photos.
      void deleteMomentPhotos(uploaded.photoPaths, uploaded.thumbnailPaths);
      throw insertError;
    }
    // Unknown: keep the photos rather than risk breaking a saved moment.
    if (existing === "unknown") throw insertError;
    inserted = existing;
  }

  Sentry.addBreadcrumb({ category: "moment", message: "db insert success", level: "info", data: { id } });

  const secondaryFailures: string[] = [];
  const secondaryOps: Promise<void>[] = [];

  if (input.selectedAlbum) {
    secondaryOps.push(
      addMomentToAlbum(input.selectedAlbum.id, id, input.userId).catch((e) => {
        Sentry.captureException(e);
        secondaryFailures.push("couldn't be added to the album");
      })
    );
  }

  if (input.peopleLinks?.length) {
    secondaryOps.push(
      savePeopleLinks({
        momentId: id,
        ownerId: input.userId,
        people: input.people,
        before: [],
        after: input.peopleLinks,
      })
    );
  }

  await Promise.all(secondaryOps);

  return { id, moment: mapRowToMoment(inserted!), secondaryFailures };
}

export interface UpdateMomentInput extends MomentFieldsInput {
  momentId: string;
  userId: string;
  /** The song as stored, to tell whether the preview needs replacing. */
  originalSong: Song;
  /** Photo and thumbnail paths on the row when the editor loaded it. */
  originalPhotos: string[];
  originalThumbnails: string[];
  /**
   * Every photo in the editor's strip, in on-screen order: stored photos the
   * user kept and local photos to upload, interleaved however they arranged
   * them. Saved in exactly this order; the first is the cover.
   */
  photos: EditedPhoto[];
  /**
   * "Who was there" links: what was stored when the editor loaded, and what
   * it has now. Leave `peopleLinks` out to keep the stored links untouched
   * (e.g. they didn't load).
   */
  originalPeopleLinks?: PersonLink[];
  peopleLinks?: PersonLink[];
}

/**
 * Save an edited moment through the same column mapping as saveMoment.
 * Photos are written in the editor's order (lib/photoOrder.ts). Uploads added
 * photos first and deletes them again if the update doesn't land; deletes
 * removed photos only after it does. The stored preview URL and song details
 * are replaced only when the song changed, so a text edit can't lose them to
 * a flaky lookup.
 */
export async function updateMoment(input: UpdateMomentInput): Promise<Moment> {
  const songChanged = songIdentityChanged(input.originalSong, input.song);

  // New library photos link instead of uploading (1.4), as in saveMoment.
  const added = input.photos.flatMap((p) => (p.kind === "new" ? [p] : []));
  const cloud = await cloudIdsFor(added.flatMap((p) => (p.assetId ? [p.assetId] : [])));
  const newRefs: MediaRefs = added.map((p) => {
    const cloudId = p.assetId ? cloud[p.assetId] : undefined;
    if (p.durationMs != null) {
      if (!cloudId) throw new Error("A video couldn't be linked to your Photos library. Remove it and try again.");
      return { cloudId, kind: "video", durationMs: p.durationMs, full: false };
    }
    return cloudId ? { cloudId, kind: "photo", full: false } : null;
  });

  const [preview, uploaded] = await Promise.all([
    songChanged ? lookupPreview(input.song) : Promise.resolve(null),
    uploadMomentPhotos(input.userId, newPhotoUris(input.photos), newRefs.map(Boolean)),
  ]);

  let columns: PhotoColumns;
  try {
    columns = buildPhotoColumns(
      input.photos,
      uploaded,
      { photos: input.originalPhotos, thumbnails: input.originalThumbnails },
      newRefs
    );
  } catch (e) {
    // Nothing references these uploads yet.
    void deleteMomentPhotos(uploaded.photoPaths, uploaded.thumbnailPaths);
    throw e;
  }

  const { data: updatedRow, error: updateError } = await writeWithOptionalColumns<Record<string, any>>(
    {
      ...momentRowFields(input, preview?.albumName ?? null),
      // A new song gets its own preview and details (null where the lookup
      // has none, so the old song's genre can't stay behind).
      ...(preview ? { song_preview_url: preview.previewUrl, ...songMetadataColumns(preview) } : {}),
      photo_urls: columns.photo_urls,
      photo_thumbnails: columns.photo_thumbnails,
      media_refs: refsColumn(columns.media_refs),
    },
    SONG_METADATA_OPTIONAL_COLUMNS,
    (row) => supabase.from("moments").update(row).eq("id", input.momentId).select("*").single()
  );

  let updated = updatedRow;
  if (updateError) {
    // Only new uploads are at stake. Their paths are fresh UUIDs, so finding
    // them on the row proves this update committed after all.
    if (uploaded.photoPaths.length === 0) throw updateError;
    const existing = await readBack(input.momentId);
    if (existing === "unknown") throw updateError;
    const stored: string[] = existing?.photo_urls ?? [];
    if (!existing || !uploaded.photoPaths.every((p) => stored.includes(p))) {
      cleanUpUnusedUploads(uploaded, existing);
      throw updateError;
    }
    updated = existing;
  }

  // The row no longer points at removed photos, but they'd stay publicly
  // readable at their known URLs.
  const { photos: gonePhotos, thumbnails: goneThumbs } = columns.removed;
  if (gonePhotos.length || goneThumbs.length) {
    void deleteMomentPhotos(gonePhotos, goneThumbs);
  }

  if (input.peopleLinks) {
    await savePeopleLinks({
      momentId: input.momentId,
      ownerId: input.userId,
      people: input.people,
      before: input.originalPeopleLinks ?? [],
      after: input.peopleLinks,
    });
  }

  return mapRowToMoment(updated!);
}

/** Delete just-uploaded photos the stored row doesn't reference. */
function cleanUpUnusedUploads(uploaded: UploadedMomentPhotos, row: Record<string, any> | null) {
  const referenced = new Set<string>([...(row?.photo_urls ?? []), ...(row?.photo_thumbnails ?? [])]);
  const unused = [...uploaded.photoPaths, ...uploaded.thumbnailPaths].filter((p) => !referenced.has(p));
  if (unused.length) void deleteMomentPhotos(unused);
}
