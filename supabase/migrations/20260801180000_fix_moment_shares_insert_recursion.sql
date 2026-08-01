-- Fix for 20260801150000: inserting a moment_share failed with 42P17
-- "infinite recursion detected in policy for relation moment_shares".
--
-- The original INSERT policy's WITH CHECK did EXISTS(moments...) to require
-- ownership. Evaluating it expands the moments SELECT policy, which
-- references moment_shares — and Postgres's recursion detection is
-- per-RELATION, not per-actual-cycle: re-entering moment_shares while its
-- policies are already being expanded raises 42P17 even though the SELECT
-- policy it would use is self-contained and the chain would terminate.
-- (That's also why reads were fine: the moment_shares SELECT policy expands
-- completely before the embedded moments query starts.)
--
-- Standard fix: check ownership through a SECURITY DEFINER function, which
-- reads moments with RLS bypassed — no policy expansion, no recursion. The
-- function only ever answers "does the CALLER own this moment", so it leaks
-- nothing: auth.uid() is taken inside, not passed in.

CREATE OR REPLACE FUNCTION public.owns_moment(p_moment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM moments
    WHERE id = p_moment_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.owns_moment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_moment(uuid) TO authenticated;

-- Same intent as before: only the moment's owner can send it, as themselves.
ALTER POLICY "Owners can send their moments"
ON public.moment_shares
WITH CHECK (
  (SELECT auth.uid()) = sender_id
  AND public.owns_moment(moment_id)
);
