-- Fix infinite recursion in tagged_moments RLS (Sentry REACT-NATIVE-K).
--
-- Root cause: "Tagged users can read moments they are tagged in" on public.moments
-- queries tagged_moments via EXISTS. When insertTaggedMoment uses .select().single(),
-- Postgres evaluates the moments SELECT policy inside the tagged_moments INSERT
-- transaction, which re-evaluates the tagged_moments SELECT policy → infinite loop.
--
-- Fix: replace the inline EXISTS subquery with a SECURITY DEFINER function that
-- bypasses RLS when checking tagged_moments, breaking the cycle.

CREATE OR REPLACE FUNCTION public.is_tagged_in_moment(p_moment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tagged_moments
    WHERE moment_id = p_moment_id
      AND tagged_user_id = auth.uid()
      AND status != 'hidden'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_tagged_in_moment(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tagged_in_moment(uuid) FROM anon;

DROP POLICY IF EXISTS "Tagged users can read moments they are tagged in" ON public.moments;
CREATE POLICY "Tagged users can read moments they are tagged in"
  ON public.moments FOR SELECT
  USING (
    visibility IN ('connections', 'link')
    AND public.is_tagged_in_moment(id)
  );
