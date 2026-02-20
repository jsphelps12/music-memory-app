import { Moment } from "@/types";

export function mapRowToMoment(row: any): Moment {
  return {
    id: row.id,
    userId: row.user_id,
    songTitle: row.song_title,
    songArtist: row.song_artist,
    songAlbumName: row.song_album_name,
    songArtworkUrl: row.song_artwork_url,
    songAppleMusicId: row.song_apple_music_id,
    songPreviewUrl: row.song_preview_url ?? null,
    reflectionText: row.reflection_text,
    photoUrls: row.photo_urls ?? [],
    photoThumbnails: row.photo_thumbnails ?? [],
    mood: row.mood,
    people: row.people ?? [],
    location: row.location,
    momentDate: row.moment_date,
    timeOfDay: row.time_of_day ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
