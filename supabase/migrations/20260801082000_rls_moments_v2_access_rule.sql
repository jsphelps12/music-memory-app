-- Sharing v2 Phase B (docs/SOCIAL-ARCHITECTURE.md): the moments SELECT policy
-- becomes the v2 access rule — own it, it's in an album you belong to, or it
-- has a live share link. The old fourth branch (visibility IN
-- ('connections','link') AND a tagged_moments row) is deleted along with the
-- tagging system; both tables it referenced are empty in prod and staging.
--
-- The new share_token branch mirrors the anon policy's existing shape (token
-- presence, not token equality — RLS cannot see which token the caller used),
-- and lets a signed-in user open a moment they reached via its share link.
-- moment_shares ("shared to me") joins this policy in Phase C.
--
-- The visibility column itself, tagged_moments, moment_reactions, and
-- collection_invites stay in the schema untouched: stranded App Store build-7
-- binaries still write/query them. They drop in the build-23 caboose
-- migration after the adoption check.
ALTER POLICY "Users can view moments"
ON public.moments
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1
    FROM collection_moments cm
    JOIN collections c ON c.id = cm.collection_id
    WHERE cm.moment_id = moments.id
      AND c.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM collection_moments cm
    JOIN collection_members cmb ON cmb.collection_id = cm.collection_id
    WHERE cm.moment_id = moments.id
      AND cmb.user_id = (SELECT auth.uid())
  )
  OR share_token IS NOT NULL
);
