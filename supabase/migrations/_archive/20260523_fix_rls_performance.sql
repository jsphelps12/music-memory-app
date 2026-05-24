-- ── RLS performance fixes ──────────────────────────────────────────────────────
--
-- Three classes of issues fixed here:
--
-- 1. auth_rls_initplan: bare auth.uid() / auth.role() calls in policies get
--    re-evaluated once per row. Wrapping in (SELECT ...) evaluates once per query.
--
-- 2. Multiple permissive policies on collection_moments: the ALL policy
--    ("Users manage own collection_moments") plus three separate operation-specific
--    policies meant Postgres evaluated 2 policies for every SELECT / INSERT / DELETE.
--    Replaced with clean per-operation policies.
--
-- 3. Public-role policies overlapping with anon-scoped policies: the public role
--    includes anon, so anon queries were hitting both a public-role policy AND an
--    anon-scoped policy (added in 20260522). Fixed by scoping the public-role
--    policies to TO authenticated so each role hits exactly one SELECT policy.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. profiles: fix bare auth.role() + scope to authenticated
--    Old USING: auth.role() = 'authenticated'  (re-evaluated per row, runs for anon too)
--    New: scope policy to TO authenticated with USING (true) — redundant role check removed
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. tagged_moments: fix bare auth.uid() in INSERT WITH CHECK
--    Old: tagger_user_id = auth.uid() (re-evaluated per row)
--    New: tagger_user_id = (SELECT auth.uid()) (evaluated once per query)
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY "Taggers can insert tags on their own moments" ON public.tagged_moments;
CREATE POLICY "Taggers can insert tags on their own moments" ON public.tagged_moments
  FOR INSERT TO authenticated
  WITH CHECK (
    tagger_user_id = (SELECT auth.uid())
    AND check_moment_owner(moment_id)
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. collections: scope public-role SELECT to authenticated
--    "Anon can read public collections" (anon-scoped, added in 20260522) already
--    covers anon users. Scoping this to authenticated eliminates the overlap.
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY "Anyone can view public collections" ON public.collections;
CREATE POLICY "Anyone can view public collections" ON public.collections
  FOR SELECT TO authenticated
  USING (is_public = true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. moments: scope public-role SELECT to authenticated
--    "Anon can read moments in public collections or with share token" (anon-scoped)
--    already covers anon. This eliminates the anon double-evaluation and also
--    prevents the share_token IS NOT NULL subquery from running for authenticated
--    users (the original reason the old any-user share-token policy was dropped).
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY "Users can view moments" ON public.moments;
CREATE POLICY "Users can view moments" ON public.moments
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM collection_moments cm
      JOIN collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM collection_moments cm
      JOIN collection_members cmb ON cmb.collection_id = cm.collection_id
      WHERE cm.moment_id = moments.id
        AND cmb.user_id = (SELECT auth.uid())
    )
    OR (
      visibility = ANY (ARRAY['connections'::text, 'link'::text])
      AND EXISTS (
        SELECT 1 FROM tagged_moments
        WHERE moment_id = moments.id
          AND tagged_user_id = (SELECT auth.uid())
          AND status <> 'hidden'
      )
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. collection_moments: replace ALL + 3 specific policies with clean per-op policies
--
--    Before: "Users manage own collection_moments" (ALL) overlapped with
--    "Non-owners can view collection_moments" (SELECT), "Members can add their
--    moments" (INSERT), and "Members can remove their own moments" (DELETE).
--    Postgres evaluated 2 policies for every operation.
--
--    After: one policy per operation, scoped to authenticated. The existing
--    "Anon can read collection_moments in public collections" (anon-scoped) is
--    unchanged and still covers anon reads.
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY "Users manage own collection_moments" ON public.collection_moments;
DROP POLICY "Non-owners can view collection_moments" ON public.collection_moments;
DROP POLICY "Members can add their moments" ON public.collection_moments;
DROP POLICY "Members can remove their own moments" ON public.collection_moments;

-- SELECT: collection owner, public collection, or member
CREATE POLICY "Can select collection_moments" ON public.collection_moments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_moments.collection_id
        AND (
          user_id = (SELECT auth.uid())
          OR is_public = true
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = collection_moments.collection_id
        AND user_id = (SELECT auth.uid())
    )
  );

-- INSERT: collection owner, or a member adding their own moment
CREATE POLICY "Can insert collection_moments" ON public.collection_moments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_moments.collection_id
        AND user_id = (SELECT auth.uid())
    )
    OR (
      added_by_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.collection_members
        WHERE collection_id = collection_moments.collection_id
          AND user_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE: collection owner removes any moment; member removes only what they added
CREATE POLICY "Can delete collection_moments" ON public.collection_moments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_moments.collection_id
        AND user_id = (SELECT auth.uid())
    )
    OR (
      added_by_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.collection_members
        WHERE collection_id = collection_moments.collection_id
          AND user_id = (SELECT auth.uid())
      )
    )
  );
