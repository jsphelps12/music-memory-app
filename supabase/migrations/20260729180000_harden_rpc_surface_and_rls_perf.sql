-- Audit follow-ups (docs/AUDIT-2026-07.md, findings #24).
--
-- 1. handle_new_user() is an auth trigger function. Being SECURITY DEFINER and
--    EXECUTE-able by anon/authenticated means it is callable directly via
--    /rest/v1/rpc/handle_new_user, which is never intended.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- 2. The anon read policy on moments re-evaluates auth.uid() once per row.
--    Wrapping it in a scalar subquery makes Postgres evaluate it a single time
--    per query (initplan) instead. Policy semantics are unchanged.
ALTER POLICY "Anon can read moments in public collections or with share token"
ON public.moments
USING (
  (SELECT auth.uid()) IS NULL
  AND (
    share_token IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM collection_moments cm
      JOIN collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id
        AND c.is_public = true
    )
  )
);
