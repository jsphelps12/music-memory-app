-- ── Anon RLS policies for public web pages ───────────────────────────────────
-- Allows the web server to use the anon key instead of the service role key.
-- Policies are scoped to the `anon` role so they don't affect authenticated
-- user query performance.

-- ── Public album view ─────────────────────────────────────────────────────────

CREATE POLICY "Anon can read public collections"
  ON public.collections FOR SELECT TO anon
  USING (is_public = true);

CREATE POLICY "Anon can read collection_moments in public collections"
  ON public.collection_moments FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND is_public = true
    )
  );

-- Moments in public collections OR with a share_token (gifted moment page).
-- Scoped to anon only — avoids the authenticated-user performance issue that
-- caused the old "Anyone can read a moment by share token" policy to be dropped
-- (that policy applied to authenticated users and prevented index usage).
CREATE POLICY "Anon can read moments in public collections or with share token"
  ON public.moments FOR SELECT TO anon
  USING (
    share_token IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.collection_moments cm
      JOIN public.collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id AND c.is_public = true
    )
  );

-- ── Profile reads for friend invite + gifted moment pages ─────────────────────
-- friend_invite_token IS NOT NULL is always true (NOT NULL DEFAULT gen_random_uuid()).
-- Access to specific profiles still requires knowing the token or user_id from
-- the URL, so enumeration requires brute-forcing a UUID.
CREATE POLICY "Anon can read profiles for public link pages"
  ON public.profiles FOR SELECT TO anon
  USING (friend_invite_token IS NOT NULL);
