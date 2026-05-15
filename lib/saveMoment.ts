import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { fetchPreviewUrl } from "@/lib/musickit";
import { uploadMomentPhotoWithThumbnail } from "@/lib/storage";
import { addMomentToCollection } from "@/lib/collections";
import { Song, Collection, Friendship } from "@/types";
import { GeoResult } from "@/lib/geocoding";

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
}

export interface SaveMomentResult {
  id: string;
  secondaryFailures: string[];
}

export async function saveMoment(input: SaveMomentInput): Promise<SaveMomentResult> {
  const { previewUrl, albumName: fetchedAlbumName } = await fetchPreviewUrl(input.song.appleMusicId);

  const results = await Promise.all(
    input.photos.map((uri) => uploadMomentPhotoWithThumbnail(input.userId, uri))
  );
  const photoPaths = results.map((r) => r.fullPath);
  const thumbnailPaths = results.map((r) => r.thumbnailPath);

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
      visibility: input.visibility,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

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

  return { id: inserted!.id, secondaryFailures };
}
