-- Drop the "Tagged users can read moments they are tagged in" policy on moments.
--
-- This policy caused infinite recursion (42P17) because it contained an EXISTS
-- subquery on tagged_moments. When insertTaggedMoment used .select().single()
-- or saveMoment did an INSERT...RETURNING, Postgres evaluated moments SELECT
-- policies inside the tagged_moments transaction → recursion.
--
-- Safe to drop: all tagged-moment reads that need cross-user moment access
-- already go through get_tagged_moment_data() (SECURITY DEFINER), which
-- bypasses RLS entirely. The three callers are:
--   fetchTaggedMomentsInbox        → rpc("get_tagged_moment_data")
--   fetchAcceptedTaggedMoments     → rpc("get_tagged_moment_data")
--   fetchTaggedMomentsSharedTab    → rpc("get_tagged_moment_data")  [fixed in same deploy]

DROP POLICY IF EXISTS "Tagged users can read moments they are tagged in" ON public.moments;

-- Also drop the helper function from the previous attempt — no longer needed.
DROP FUNCTION IF EXISTS public.is_tagged_in_moment(uuid);
