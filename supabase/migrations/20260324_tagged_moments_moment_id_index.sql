-- Speed up the "Tagged users can read moments they are tagged in" RLS policy.
-- The EXISTS subquery filters by (moment_id, tagged_user_id); this index covers it.
CREATE INDEX IF NOT EXISTS tagged_moments_moment_tagged_idx
  ON tagged_moments(moment_id, tagged_user_id);
