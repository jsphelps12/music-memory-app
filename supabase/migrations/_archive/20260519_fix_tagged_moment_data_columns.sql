-- Rewrite get_tagged_moment_data to return only card columns instead of SETOF moments (all columns).
-- Reduces egress: the original returned every column on the moments table for each tagged moment.

DROP FUNCTION IF EXISTS get_tagged_moment_data(uuid[]);

CREATE OR REPLACE FUNCTION get_tagged_moment_data(p_moment_ids uuid[])
RETURNS TABLE(
  id uuid,
  moment_date date,
  created_at timestamptz,
  song_title text,
  song_artist text,
  song_album_name text,
  song_artwork_url text,
  song_apple_music_id text,
  song_preview_url text,
  mood text,
  photo_urls text[],
  photo_thumbnails text[],
  reflection_text text,
  guest_name text,
  guest_uuid text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT
    m.id,
    m.moment_date,
    m.created_at,
    m.song_title,
    m.song_artist,
    m.song_album_name,
    m.song_artwork_url,
    m.song_apple_music_id,
    m.song_preview_url,
    m.mood,
    m.photo_urls,
    m.photo_thumbnails,
    m.reflection_text,
    m.guest_name,
    m.guest_uuid
  FROM moments m
  INNER JOIN tagged_moments tm
    ON tm.moment_id = m.id
   AND tm.tagged_user_id = auth.uid()
  WHERE m.id = ANY(p_moment_ids);
$$;

GRANT EXECUTE ON FUNCTION get_tagged_moment_data(uuid[]) TO authenticated;
