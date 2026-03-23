-- Enable RLS on collection_members (was missing)
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;

-- Users can see their own membership row; collection owners can see all rows in their collection.
-- NOTE: the original version had a third clause querying collection_members from within itself,
-- causing infinite recursion (Postgres error 42P17). Removed — self-referential RLS policies
-- must never query the same table they are defined on.
CREATE POLICY "Members can view collection membership"
  ON public.collection_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );

-- Users can only insert themselves
CREATE POLICY "Users can join collections"
  ON public.collection_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can remove themselves; collection owners can remove any member
CREATE POLICY "Users can leave or be removed from collections"
  ON public.collection_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );
