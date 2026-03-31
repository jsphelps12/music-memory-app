-- DROP over-broad share_token SELECT policies on moments.
-- These policies (`share_token IS NOT NULL`) evaluated to TRUE for nearly every
-- row, preventing the query planner from using the user_id index under RLS.
-- Result: statement timeouts for users with larger moment counts.
--
-- The Gift a Memory web page uses server-side rendering with the service role
-- key (bypasses RLS), so these policies are not needed for that feature.

DROP POLICY IF EXISTS "Anyone can read a moment by share token" ON public.moments;
DROP POLICY IF EXISTS "Public can view moments by share token" ON public.moments;
