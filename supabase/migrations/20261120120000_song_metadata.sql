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
