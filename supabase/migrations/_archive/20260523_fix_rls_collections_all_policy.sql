-- ── Fix collections ALL policy ────────────────────────────────────────────────
--
-- "Users manage own collections" was an ALL policy scoped to the public role.
-- Since public includes anon, it caused two issues:
--   1. Anon SELECT evaluated both this ALL policy + the anon-scoped SELECT policy.
--   2. Authenticated SELECT evaluated both this ALL policy + "Anyone can view
--      public collections" — two permissive SELECT policies per query.
--
-- Fix: replace the ALL policy with explicit per-operation authenticated policies,
-- and merge the two SELECT policies into one.

DROP POLICY "Users manage own collections" ON public.collections;

-- Single SELECT: owner + public collections in one policy (no more double-eval).
-- Anon users fall through to the "Anon can read public collections" policy only.
DROP POLICY "Anyone can view public collections" ON public.collections;
CREATE POLICY "Can select collections" ON public.collections
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR is_public = true
  );

CREATE POLICY "Owners can insert collections" ON public.collections
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can update collections" ON public.collections
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can delete collections" ON public.collections
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
