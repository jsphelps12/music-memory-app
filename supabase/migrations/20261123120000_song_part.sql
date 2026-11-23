-- The part of the song (Josh, 2026-11-23): where in the song the moment
-- lives, one point ("the bridge at 2:41"), in milliseconds from the start.
-- Full playback of the moment starts there; previews (a fixed 30 s clip)
-- can't, so for them it's a label.
--
-- Additive and idempotent: one nullable column. Old builds never name it,
-- so their inserts leave it null and their updates leave it alone. The
-- shared view (moment_view_for) returns whole rows through to_jsonb, so
-- people a moment is shared with see the part too; it says nothing private.

ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS song_part_ms integer;

-- Within a song: not negative, and under 2 hours (nothing longer is a song).
ALTER TABLE public.moments DROP CONSTRAINT IF EXISTS moments_song_part_ms_check;
ALTER TABLE public.moments ADD CONSTRAINT moments_song_part_ms_check
  CHECK (song_part_ms IS NULL OR (song_part_ms >= 0 AND song_part_ms < 7200000));

NOTIFY pgrst, 'reload schema';
