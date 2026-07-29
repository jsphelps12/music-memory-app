-- Applied to production 2026-05-26; recovered into the repo 2026-07-29.
-- Supports the timeline query (user_id filter + created_at ordering).
CREATE INDEX IF NOT EXISTS moments_user_created_idx
  ON public.moments USING btree (user_id, created_at DESC);
