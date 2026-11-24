-- DB-2: the shared view, step 2 (docs/ROADMAP.md, "Sharing work, in order").
--
-- Apply ONLY after app_config.min_supported_build is 16 (1.4.1) or higher
-- (production: raised to 16 on 2026-11-23).
-- Builds before 1.4.1 read other people's moments and their own profile
-- straight from the tables; 1.4.1 reads them through the definer functions
-- below, which this migration leaves unchanged. The guard in step 0 refuses
-- to run while the floor is lower.
--
-- After this:
--   moments   Direct table access is owner-only: a signed-in user reads,
--             updates and deletes only their own rows; signed-out callers
--             have no table access. Everyone else reads a moment through the
--             shared view (moment_view_for) and its functions:
--               get_moment_view(uuid)                 detail screen
--               get_shared_with_me(int, int)          "Shared with you"
--               get_shared_collection_moments(uuid)   shared album
--               open_shared_moment(text)              /m/ link, signed in
--               get_shared_moment(text)               /m/ web page
--             An album owner removes a guest's contribution through the
--             delete-guest-moments edge function, as 1.4.1 already does.
--   profiles  Signed-in users read only id, display_name, avatar_url and
--             username of any profile (column grants; fetchProfilesByIds,
--             get_public_profiles and get_profile_by_invite_token keep
--             working). The caller's own full row comes from get_my_profile().
--             Updating your own row is unchanged. Signed-out callers have no
--             table access (already true since 20261118000000).
--
-- No function signatures change. Idempotent: every policy is dropped if it
-- exists before it is created, and grants/revokes can be repeated.

-- 0. Refuse to run until the min-build floor covers 1.4.1 (build 16). A test
--    database with a lower floor can opt out for its own session:
--      set db2.skip_min_build_check = 'on';
DO $$
DECLARE
  v_floor integer;
BEGIN
  IF coalesce(current_setting('db2.skip_min_build_check', true), '') = 'on' THEN
    RETURN;
  END IF;

  SELECT (value #>> '{}')::integer INTO v_floor
    FROM public.app_config
   WHERE key = 'min_supported_build';

  IF coalesce(v_floor, 0) < 16 THEN
    RAISE EXCEPTION
      'DB-2 needs app_config.min_supported_build >= 16 (1.4.1); it is %', coalesce(v_floor::text, 'unset');
  END IF;
END $$;

-- 1. moments: owner-only.
DROP POLICY IF EXISTS "Anon can read moments in public collections or with share token" ON public.moments;
DROP POLICY IF EXISTS "Users can view moments" ON public.moments;
DROP POLICY IF EXISTS "Owners can read their moments" ON public.moments;

CREATE POLICY "Owners can read their moments"
  ON public.moments
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- The delete policy's album-owner branch for guest moments is replaced by the
-- delete-guest-moments edge function (service role), which also removes the
-- guest's photos. With reads owner-only that branch could no longer match a
-- filtered delete anyway, so the policy says what it does.
DROP POLICY IF EXISTS "Users can delete moments" ON public.moments;
DROP POLICY IF EXISTS "Owners can delete their moments" ON public.moments;

CREATE POLICY "Owners can delete their moments"
  ON public.moments
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Signed-out callers reach moments only through get_shared_moment().
REVOKE ALL ON public.moments FROM anon;
-- Clients never truncate or reference the table.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.moments FROM authenticated;

-- 2. profiles: public columns only for signed-in users.
--    Table-level SELECT is replaced by SELECT on four columns. The row policy
--    stays "any signed-in user" (album members, friends and people met
--    through links all need a name and avatar); the column grant is what
--    keeps the rest of the row with its owner. Columns added later are not
--    readable by clients unless granted here.
REVOKE ALL ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, username) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- get_my_profile() is the one way to read your own private columns. Keep it
-- callable by signed-in users only (it exists since 20261020120000).
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 3. Pick up the new grants in the API right away.
NOTIFY pgrst, 'reload schema';
