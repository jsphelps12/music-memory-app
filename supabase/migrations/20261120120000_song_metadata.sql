-- Song details and how the moment was captured (2026-11-20).
--
-- Capture already looks the song up on the iTunes lookup API for its preview
-- clip. The same response has the genre, release date, artist and album ids
-- and the length; Insights will use them for favorite genres and musical
-- periods. capture_source records the way into capture (lib/captureSource.ts).
-- Older moments are filled by scripts/backfill-song-metadata.mjs (reviewed
-- SQL, applied by hand).
--
-- Additive and safe for every app build in the wild: nullable columns with no
-- default (no table rewrite), no RLS or function changes. Builds that don't
-- send these columns insert NULL. Functions typed on the row
-- (moment_view_for, RETURNS SETOF public.moments, %ROWTYPE variables) pick the
-- new columns up as extra keys/fields; no client reads a moments row into a
-- shape that rejects unknown keys. The app retries a write without these
-- columns if they are missing, so it may ship before this is applied.

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS song_genre text,
  ADD COLUMN IF NOT EXISTS song_release_date date,
  ADD COLUMN IF NOT EXISTS song_artist_id text,
  ADD COLUMN IF NOT EXISTS song_album_id text,
  ADD COLUMN IF NOT EXISTS song_duration_ms integer,
  ADD COLUMN IF NOT EXISTS capture_source text;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS. Added NOT VALID (no scan under
-- the exclusive lock), then validated, which doesn't block writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'moments_capture_source_check'
       AND conrelid = 'public.moments'::regclass
  ) THEN
    ALTER TABLE public.moments
      ADD CONSTRAINT moments_capture_source_check
      CHECK (
        capture_source IS NULL OR capture_source IN (
          'now_playing', 'identify', 'search', 'share', 'widget',
          'nudge', 'last_week', 'from_before', 'draft', 'other'
        )
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.moments VALIDATE CONSTRAINT moments_capture_source_check;

COMMENT ON COLUMN public.moments.song_genre IS
  'iTunes primaryGenreName at capture. NULL for Spotify songs, failed lookups and older moments.';
COMMENT ON COLUMN public.moments.song_release_date IS
  'iTunes releaseDate (date part) at capture.';
COMMENT ON COLUMN public.moments.song_artist_id IS
  'iTunes/Apple Music artistId at capture.';
COMMENT ON COLUMN public.moments.song_album_id IS
  'iTunes/Apple Music collectionId at capture.';
COMMENT ON COLUMN public.moments.song_duration_ms IS
  'iTunes trackTimeMillis at capture.';
COMMENT ON COLUMN public.moments.capture_source IS
  'How the moment was captured (lib/captureSource.ts). NULL for moments saved before 2026-11-20 or by older builds.';


-- The shared view hides fields by name, so a new owner-only column has to be
-- named here too: how a moment was captured (the nudge, the widget, a share)
-- is the owner's, like place and people. Same definition as
-- 20261119000000_shared_view.sql plus "- 'capture_source'"; the song details
-- above are public catalog data and pass through.
CREATE OR REPLACE FUNCTION public.moment_view_for(p_moment public.moments, p_viewer uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_viewer IS NOT NULL AND (p_moment).user_id = p_viewer THEN to_jsonb(p_moment)
    ELSE (to_jsonb(p_moment) - 'share_token' - 'capture_source')
      || jsonb_build_object(
        'location', NULL,
        'location_lat', NULL,
        'location_lng', NULL,
        'people', '[]'::jsonb,
        'media_refs',
        COALESCE(
          (SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(r.ref) = 'object'
                         THEN r.ref || '{"cloudId": ""}'::jsonb
                         ELSE r.ref END
                    ORDER BY r.ord)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof((p_moment).media_refs) = 'array'
                         THEN (p_moment).media_refs ELSE '[]'::jsonb END
                  ) WITH ORDINALITY AS r(ref, ord)),
          '[]'::jsonb)
      )
      || COALESCE(
        (SELECT jsonb_build_object(
                  'owner_display_name', pr.display_name,
                  'owner_avatar_url', pr.avatar_url)
           FROM public.profiles pr
          WHERE pr.id = (p_moment).user_id),
        '{}'::jsonb)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.moment_view_for(public.moments, uuid) FROM PUBLIC, anon, authenticated;
