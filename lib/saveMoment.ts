import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { uploadMomentPhotoWithThumbnail } from "@/lib/storage";
import { addMomentToCollection } from "@/lib/collections";
import { Song, Collection, Friendship, Moment } from "@/types";
import { GeoResult } from "@/lib/geocoding";
import { mapRowToMoment } from "@/lib/moments";

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Late Night";
}

export interface SaveMomentInput {
  userId: string;
  song: Song;
  reflection: string;
  photos: string[];
  people: string[];
  mood: string | null;
  locationResult: GeoResult | null;
  momentDate: Date | null;
  visibility: 'private' | 'connections' | 'link';
  selectedCollection?: Collection | null;
  taggedFriends?: Array<{ friend: Friendship; send: boolean }>;
  prefetchedPreview?: { previewUrl: string | null; albumName: string | null } | null;
}

export interface SaveMomentResult {
  id: string;
  moment: Moment;
  secondaryFailures: string[];
}

export async function saveMoment(input: SaveMomentInput): Promise<SaveMomentResult> {
  Sentry.addBreadcrumb({
    category: "moment",
    message: "save_moment started",
    level: "info",
    data: { photoCount: input.photos.length, song: input.song.title, hasCollection: !!input.selectedCollection },
  });

  const [preview, photoResults] = await Promise.all([
    input.prefetchedPreview !== undefined
      ? Promise.resolve(input.prefetchedPreview ?? { previewUrl: null, albumName: null })
      : fetchPreviewUrl(input.song.appleMusicId),
    Promise.all(input.photos.map((uri) => uploadMomentPhotoWithThumbnail(input.userId, uri))),
  ]);
  const { previewUrl, albumName: fetchedAlbumName } = preview;
  const photoPaths = photoResults.map((r) => r.fullPath);
  const thumbnailPaths = photoResults.map((r) => r.thumbnailPath);

  Sentry.addBreadcrumb({ category: "moment", message: "preview_url + photos ready", level: "info", data: { photoCount: photoResults.length } });

  const { data: inserted, error: insertError } = await supabase
    .from("moments")
    .insert({
      user_id: input.userId,
      song_title: input.song.title,
      song_artist: input.song.artistName,
      song_album_name: input.song.albumName || fetchedAlbumName || null,
      song_artwork_url: input.song.artworkUrl || null,
      song_apple_music_id: input.song.appleMusicId,
      song_preview_url: previewUrl,
      reflection_text: input.reflection.trim(),
      mood: input.mood,
      people: input.people,
      photo_urls: photoPaths,
      photo_thumbnails: thumbnailPaths,
      location: input.locationResult?.name ?? null,
      location_lat: input.locationResult?.lat ?? null,
      location_lng: input.locationResult?.lng ?? null,
      moment_date: input.momentDate
        ? `${input.momentDate.getFullYear()}-${String(input.momentDate.getMonth() + 1).padStart(2, "0")}-${String(input.momentDate.getDate()).padStart(2, "0")}`
        : null,
      time_of_day: getTimeOfDay(),
      // If tagging friends with send:true, upgrade private → connections so they can read it
      visibility: input.visibility === 'private' && input.taggedFriends?.some((tf) => tf.send)
        ? 'connections'
        : input.visibility,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;

  Sentry.addBreadcrumb({ category: "moment", message: "db insert success", level: "info", data: { id: inserted?.id } });

  const secondaryFailures: string[] = [];
  const secondaryOps: Promise<void>[] = [];

  if (input.selectedCollection && inserted?.id) {
    secondaryOps.push(
      addMomentToCollection(input.selectedCollection.id, inserted.id, input.userId).catch((e) => {
        Sentry.captureException(e);
        secondaryFailures.push("couldn't be added to the collection");
      })
    );
  }

  if (inserted?.id && input.taggedFriends && input.taggedFriends.length > 0) {
    secondaryOps.push(
      import("@/lib/friends").then(({ insertTaggedMoment }) =>
        Promise.allSettled(
          input.taggedFriends!.map((tf) =>
            insertTaggedMoment(inserted.id, tf.friend.otherUserId, tf.send)
          )
        )
      ).then((tagResults) => {
        const failures = tagResults.filter((r) => r.status === "rejected");
        failures.forEach((r) => Sentry.captureException((r as PromiseRejectedResult).reason));
        if (failures.length > 0) secondaryFailures.push("some friend tags didn't send");
      })
    );
  }

  await Promise.all(secondaryOps);

  return { id: inserted!.id, moment: mapRowToMoment(inserted!), secondaryFailures };
}
