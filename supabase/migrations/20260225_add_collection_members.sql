-- collection_members: tracks who has joined a shared collection
CREATE TABLE public.collection_members (
  collection_id uuid NOT NULL REFERENCES public.collections ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (collection_id, user_id)
);
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships
CREATE POLICY "Members can read their memberships"
  ON public.collection_members FOR SELECT
  USING (auth.uid() = user_id);

-- Users can join public collections
CREATE POLICY "Users can join collections"
  ON public.collection_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can leave collections they joined; owners can also remove members
CREATE POLICY "Users can leave or owners can remove"
  ON public.collection_members FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------
-- collection_moments: add added_by_user_id for contributor attribution
-- -----------------------------------------------------------------------
ALTER TABLE public.collection_moments
  ADD COLUMN IF NOT EXISTS added_by_user_id uuid REFERENCES auth.users ON DELETE SET NULL;

-- Drop the old blanket owner-only policy and replace with granular ones
DROP POLICY IF EXISTS "Users manage own collection_moments" ON public.collection_moments;

-- Collection owner can do everything
CREATE POLICY "Owner can manage collection_moments"
  ON public.collection_moments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );

-- Members can read all moments in collections they've joined
CREATE POLICY "Members can read collection_moments"
  ON public.collection_moments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = collection_moments.collection_id AND user_id = auth.uid()
    )
  );

-- Members can add their own moments to collections they've joined
CREATE POLICY "Members can add their moments"
  ON public.collection_moments FOR INSERT
  WITH CHECK (
    auth.uid() = added_by_user_id
    AND EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = collection_moments.collection_id AND user_id = auth.uid()
    )
  );

-- Members can remove moments they personally added
CREATE POLICY "Members can remove their own moments"
  ON public.collection_moments FOR DELETE
  USING (
    auth.uid() = added_by_user_id
    AND EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = collection_moments.collection_id AND user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------
-- collections: allow members to read collections they've joined,
--              and anyone to read public collections (for join screen)
-- -----------------------------------------------------------------------
CREATE POLICY "Members can view joined collections"
  ON public.collections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view public collections"
  ON public.collections FOR SELECT
  USING (is_public = true);

-- -----------------------------------------------------------------------
-- moments: members can read other users' moments that are in shared collections
-- -----------------------------------------------------------------------
CREATE POLICY "Members can read moments in shared collections"
  ON public.moments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collection_moments cm
      JOIN public.collection_members cmb ON cmb.collection_id = cm.collection_id
      WHERE cm.moment_id = moments.id AND cmb.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------
-- profiles: any authenticated user can read profiles (needed for attribution)
-- -----------------------------------------------------------------------
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
