export const MOMENT_CARD_COLUMNS =
  "id, user_id, moment_date, created_at, song_title, song_artist, song_album_name, " +
  "song_artwork_url, song_provider, song_apple_music_id, song_spotify_id, song_preview_url, " +
  "mood, moods, photo_urls, photo_thumbnails, media_refs, reflection_text, guest_name, guest_uuid, " +
  // The part of the song (20261123120000_song_part.sql): on cards so a card
  // tap's autoplay can start there. Needs the column in the database first.
  "song_part_ms";

/**
 * Year in review needs people and place too, which card queries leave out.
 * Keep in step with MOMENT_CARD_COLUMNS and mapRowToMoment.
 */
export const YEAR_REVIEW_COLUMNS = `${MOMENT_CARD_COLUMNS}, people, location`;
