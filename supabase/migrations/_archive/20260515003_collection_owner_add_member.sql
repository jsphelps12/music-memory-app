-- Allow collection owners to directly add other users as members
-- (previously only users could insert their own row via the invite link flow)
DROP POLICY IF EXISTS "Users can join collections" ON public.collection_members;
CREATE POLICY "Users can join or be added to collections"
  ON public.collection_members FOR INSERT
  WITH CHECK (
    -- User joining themselves (invite link / QR flow)
    auth.uid() = user_id
    OR
    -- Collection owner adding a user directly
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );
