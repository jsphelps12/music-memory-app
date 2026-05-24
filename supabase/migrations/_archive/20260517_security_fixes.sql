-- ── Security fixes ────────────────────────────────────────────────────────────
-- 1. get_random_moment / get_random_forgotten_moment accepted a caller-supplied
--    p_user_id, allowing any authenticated user to read another user's moments.
--    Fix: remove the parameter and use auth.uid() internally.
-- 2. get_shared_collection_moments had no authorization check, allowing any
--    authenticated user to read moments from any collection.
-- 3. Add missing GRANT EXECUTE on all three SECURITY DEFINER functions.
-- 4. Missing indexes on collection_members, collection_invites, moment_reactions.
-- 5. profile_visibility column was unenforced in RLS.

-- ── 1. get_random_moment ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_random_moment(uuid);

CREATE OR REPLACE FUNCTION get_random_moment()
RETURNS SETOF moments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM moments
  WHERE user_id = auth.uid()
  ORDER BY RANDOM()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_random_moment() TO authenticated;

-- ── 2. get_random_forgotten_moment ────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_random_forgotten_moment(uuid, timestamptz);

CREATE OR REPLACE FUNCTION get_random_forgotten_moment(p_cutoff timestamptz)
RETURNS SETOF moments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM moments
  WHERE user_id = auth.uid()
    AND created_at < p_cutoff
  ORDER BY RANDOM()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_random_forgotten_moment(timestamptz) TO authenticated;

-- ── 3. get_shared_collection_moments — add authorization check ─────────────────

CREATE OR REPLACE FUNCTION get_shared_collection_moments(p_collection_id uuid)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be the collection owner or a member
  IF NOT EXISTS (
    SELECT 1 FROM public.collections
    WHERE id = p_collection_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.collection_members
    WHERE collection_id = p_collection_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(m.*) || jsonb_build_object(
    'contributor_name',
      CASE
        WHEN m.guest_uuid IS NOT NULL AND m.guest_name IS NOT NULL THEN m.guest_name
        ELSE COALESCE(p.display_name, owner.display_name)
      END,
    'added_by_user_id', cm.added_by_user_id
  )
  FROM collection_moments cm
  JOIN moments m ON m.id = cm.moment_id
  LEFT JOIN profiles p ON p.id = cm.added_by_user_id
  LEFT JOIN profiles owner ON owner.id = m.user_id
  WHERE cm.collection_id = p_collection_id
  ORDER BY cm.added_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_collection_moments(uuid) TO authenticated;

-- ── 4. Missing indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS collection_members_collection_id_idx
  ON public.collection_members (collection_id);

CREATE INDEX IF NOT EXISTS collection_members_user_id_idx
  ON public.collection_members (user_id);

CREATE INDEX IF NOT EXISTS collection_invites_collection_id_idx
  ON public.collection_invites (collection_id);

CREATE INDEX IF NOT EXISTS moment_reactions_moment_id_idx
  ON public.moment_reactions (moment_id);

-- ── 5. Enforce profile_visibility in RLS ─────────────────────────────────────
-- Previously all profiles were readable by all authenticated users regardless
-- of the profile_visibility setting. Now:
--   'public'       — readable by anyone authenticated
--   'friends_only' — readable only by accepted friends (or self)

DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR profile_visibility = 'public'
    OR (
      profile_visibility = 'friends_only'
      AND EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
          AND (
            (requester_id = auth.uid() AND addressee_id = profiles.id)
            OR (addressee_id = auth.uid() AND requester_id = profiles.id)
          )
      )
    )
  );
