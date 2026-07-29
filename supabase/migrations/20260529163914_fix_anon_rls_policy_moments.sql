-- Applied to production 2026-05-29; recovered into the repo 2026-07-29.
--
-- Load-bearing: this is the policy that lets the public web pages
-- (web/app/m/[share_token], web/app/c/[invite_code]) read moments as `anon`.
-- It is also what allowed the web app to drop the service-role key.
-- Rebuilding the database without it makes the entire public share surface
-- return empty.
ALTER POLICY "Anon can read moments in public collections or with share token"
ON public.moments
USING (
  auth.uid() IS NULL
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
