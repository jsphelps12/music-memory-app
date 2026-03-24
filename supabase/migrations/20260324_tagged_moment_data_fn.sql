-- SECURITY DEFINER function: safely fetch moment data for tagged moments.
-- Bypasses moments RLS (no per-row subquery tax), but enforces its own
-- security check via the JOIN — caller only gets moments they're tagged in.

CREATE OR REPLACE FUNCTION get_tagged_moment_data(p_moment_ids uuid[])
RETURNS SETOF moments
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT m.*
  FROM moments m
  INNER JOIN tagged_moments tm
    ON tm.moment_id = m.id
   AND tm.tagged_user_id = auth.uid()
  WHERE m.id = ANY(p_moment_ids);
$$;

GRANT EXECUTE ON FUNCTION get_tagged_moment_data(uuid[]) TO authenticated;

-- Also add the index to support the RLS subquery pattern if we ever re-introduce it,
-- and to speed up tagged_moments joins in general.
CREATE INDEX IF NOT EXISTS tagged_moments_moment_tagged_idx
  ON tagged_moments(moment_id, tagged_user_id);
