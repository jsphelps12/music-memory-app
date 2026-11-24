import { Moment, MusicProviderType } from "@/types";
import { alignRefs } from "@/lib/linkedMedia";

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
    // Catalog details and how it was captured (20261120120000_song_metadata.sql).
    // Not in MOMENT_CARD_COLUMNS, so null on card rows; rows from before the
    // columns existed are null too.
    songGenre: row.song_genre ?? null,
    songReleaseDate: row.song_release_date ?? null,
    songArtistId: row.song_artist_id ?? null,
    songAlbumId: row.song_album_id ?? null,
    songDurationMs: row.song_duration_ms ?? null,
    // The part of the song (20261123120000_song_part.sql); in card rows too.
    songPartMs: row.song_part_ms ?? null,
    captureSource: row.capture_source ?? null,
    // The owner's voice recording (20261124120000_voice_entries.sql). Not in
    // MOMENT_CARD_COLUMNS, and the shared view leaves it out for anyone but
    // the owner, so null there too.
    voicePath: row.voice_path ?? null,
    voiceDurationMs: row.voice_duration_ms ?? null,
    reflectionText: row.reflection_text,
    photoUrls: row.photo_urls ?? [],
    photoThumbnails: row.photo_thumbnails ?? [],
    mediaRefs: alignRefs(row.media_refs, (row.photo_urls ?? []).length),
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
