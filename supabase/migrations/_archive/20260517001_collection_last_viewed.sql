-- Track when each user last viewed a shared collection.
-- Used to compute "new moments since last visit" in the Shared tab.
--
-- Members: last_viewed_at on collection_members (one row per member per collection)
-- Owners: owner_last_viewed_at on collections (owners aren't in collection_members)

ALTER TABLE public.collection_members
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS owner_last_viewed_at timestamptz;

-- Allow members to update their own last_viewed_at
DROP POLICY IF EXISTS "Members can update their own last_viewed_at" ON public.collection_members;
CREATE POLICY "Members can update their own last_viewed_at"
  ON public.collection_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
