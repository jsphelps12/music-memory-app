import * as Sentry from "@sentry/react-native";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { getProvider } from "@/lib/providers";
import { uploadMomentPhotos, deleteMomentPhotos, type UploadedMomentPhotos } from "@/lib/storage";
import { addMomentToAlbum } from "@/lib/albums";
import { Song, Album, Moment } from "@/types";
import { mapRowToMoment } from "@/lib/moments";
import {
  momentRowFields,
  removedPaths,
  songIdentityChanged,
  type MomentFieldsInput,
} from "@/lib/momentRow";

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late Night";
}

type PreviewResult = { previewUrl: string | null; albumName: string | null };

const NO_PREVIEW: PreviewResult = { previewUrl: null, albumName: null };

/** The song's preview lookup. Never rejects: a missing preview never fails a save. */
function lookupPreview(song: Song): Promise<PreviewResult> {
  return getProvider(song.provider)
    .fetchPreviewUrl(song)
    .then((url) => ({ previewUrl: url, albumName: null }))
    .catch(() => NO_PREVIEW);
}

export interface SaveMomentInput extends MomentFieldsInput {
  userId: string;
  photos: string[];
  selectedAlbum?: Album | null;
  /**
   * A preview lookup already started when the song was picked. Pass the
   * promise itself, not its result, so photo uploads don't wait on it.
   */
  prefetchedPreview?: Promise<PreviewResult | null> | null;
  weatherResult?: { tempF: number; condition: string } | null;
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
  const previewPromise: Promise<PreviewResult> = input.prefetchedPreview
    ? input.prefetchedPreview.then((p) => p ?? NO_PREVIEW).catch(() => NO_PREVIEW)
    : lookupPreview(input.song);
  const [preview, uploaded] = await Promise.all([
    previewPromise,
    uploadMomentPhotos(input.userId, input.photos),
  ]);

  Sentry.addBreadcrumb({ category: "moment", message: "preview_url + photos ready", level: "info", data: { photoCount: uploaded.photoPaths.length } });

  // The id is chosen here, not by the database, so a failed insert can be
  // checked: if the row exists after all, the save succeeded.
  const id = Crypto.randomUUID();
  const { data: insertedRow, error: insertError } = await supabase
    .from("moments")
    .insert({
      id,
      user_id: input.userId,
      ...momentRowFields(input, preview.albumName),
      song_preview_url: preview.previewUrl,
      photo_urls: uploaded.photoPaths,
      photo_thumbnails: uploaded.thumbnailPaths,
      time_of_day: getTimeOfDay(),
      weather_temp_f: input.weatherResult?.tempF ?? null,
      weather_condition: input.weatherResult?.condition ?? null,
      // No visibility write (Social Architecture v2): the column still exists
      // for stranded build-7 binaries and takes its 'private' DB default here.
      // Privacy is the absence of grant rows, not this column.
    })
    .select("*")
    .single();

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
  /** Existing paths the user kept, in order. */
  keptPhotos: string[];
  keptThumbnails: string[];
  /** Local URIs of photos added in the editor. */
  newPhotos: string[];
}

/**
 * Save an edited moment through the same column mapping as saveMoment.
 * Uploads added photos first and deletes them again if the update doesn't
 * land; deletes removed photos only after it does. The stored preview URL is
 * replaced only when the song changed, so a text edit can't lose it to a
 * flaky lookup.
 */
export async function updateMoment(input: UpdateMomentInput): Promise<Moment> {
  const songChanged = songIdentityChanged(input.originalSong, input.song);

  const [preview, uploaded] = await Promise.all([
    songChanged ? lookupPreview(input.song) : Promise.resolve(null),
    uploadMomentPhotos(input.userId, input.newPhotos),
  ]);

  const photoUrls = [...input.keptPhotos, ...uploaded.photoPaths];
  const photoThumbnails = [...input.keptThumbnails, ...uploaded.thumbnailPaths];

  const { data: updatedRow, error: updateError } = await supabase
    .from("moments")
    .update({
      ...momentRowFields(input, preview?.albumName ?? null),
      ...(preview ? { song_preview_url: preview.previewUrl } : {}),
      photo_urls: photoUrls,
      photo_thumbnails: photoThumbnails,
    })
    .eq("id", input.momentId)
    .select("*")
    .single();

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
  const goneThumbs = removedPaths(input.originalThumbnails, input.keptThumbnails);
  const gonePhotos = removedPaths(input.originalPhotos, input.keptPhotos);
  if (gonePhotos.length || goneThumbs.length) {
    void deleteMomentPhotos(gonePhotos, goneThumbs);
  }

  return mapRowToMoment(updated!);
}

/** Delete just-uploaded photos the stored row doesn't reference. */
function cleanUpUnusedUploads(uploaded: UploadedMomentPhotos, row: Record<string, any> | null) {
  const referenced = new Set<string>([...(row?.photo_urls ?? []), ...(row?.photo_thumbnails ?? [])]);
  const unused = [...uploaded.photoPaths, ...uploaded.thumbnailPaths].filter((p) => !referenced.has(p));
  if (unused.length) void deleteMomentPhotos(unused);
}
