-- Single-query random moment selection, avoiding the client-side 2-step
-- (fetch all IDs → pick random → fetch full row) pattern.
CREATE OR REPLACE FUNCTION get_random_moment(p_user_id uuid)
RETURNS SETOF moments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM moments
  WHERE user_id = p_user_id
  ORDER BY RANDOM()
  LIMIT 1;
$$;

-- Same but restricted to moments older than p_cutoff (for "forgotten" resurfacing).
CREATE OR REPLACE FUNCTION get_random_forgotten_moment(p_user_id uuid, p_cutoff timestamptz)
RETURNS SETOF moments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM moments
  WHERE user_id = p_user_id
    AND created_at < p_cutoff
  ORDER BY RANDOM()
  LIMIT 1;
$$;
