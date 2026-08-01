import { Moment, MusicProviderType } from "@/types";

export function mapRowToMoment(row: any): Moment {
  return {
    id: row.id,
    userId: row.user_id,
    songTitle: row.song_title,
    songArtist: row.song_artist,
    songAlbumName: row.song_album_name,
    songArtworkUrl: row.song_artwork_url,
    songProvider: (row.song_provider as MusicProviderType) ?? 'apple_music',
    songAppleMusicId: row.song_apple_music_id ?? null,
    songSpotifyId: row.song_spotify_id ?? null,
    songPreviewUrl: row.song_preview_url ?? null,
    reflectionText: row.reflection_text,
    photoUrls: row.photo_urls ?? [],
    photoThumbnails: row.photo_thumbnails ?? [],
    // Dual-read during the multi-mood transition: rows written by binaries
    // <= build 22 only have the single mood column.
    moods: row.moods ?? (row.mood ? [row.mood] : []),
    people: row.people ?? [],
    location: row.location,
    locationLat: row.location_lat ?? null,
    locationLng: row.location_lng ?? null,
    momentDate: row.moment_date,
    timeOfDay: row.time_of_day ?? null,
    weatherTempF: row.weather_temp_f ?? null,
    weatherCondition: row.weather_condition ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shareToken: row.share_token ?? null,
    guestUuid: row.guest_uuid ?? null,
    // Guest contributions carry their attribution on the row itself; for
    // authenticated contributors the shared-album RPC supplies contributorName
    // from profiles instead (and overwrites this with the same value for guests).
    // Keyed conditionally so non-guest moments keep the exact field set the
    // card-column contract tests pin.
    ...(row.guest_uuid && row.guest_name ? { contributorName: row.guest_name } : {}),
  };
}
