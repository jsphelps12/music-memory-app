-- Enable RLS on collection_members (was missing)
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members in collections they belong to or own
CREATE POLICY "Members can view collection membership"
  ON public.collection_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.collection_members cm2
      WHERE cm2.collection_id = collection_members.collection_id
        AND cm2.user_id = auth.uid()
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
