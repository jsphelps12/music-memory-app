-- Fix: collection owners could not read moments contributed by members.
-- The existing "Members can read moments in shared collections" policy only
-- covers users in collection_members. The owner lives in collections.user_id
-- and was never in collection_members, so they were blocked from seeing
-- member-contributed moments.

CREATE POLICY "Collection owners can read member moments"
  ON public.moments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collection_moments cm
      JOIN public.collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id
        AND c.user_id = auth.uid()
    )
  );

-- Fix: storage SELECT policy only allowed users to read their own photos.
-- When a member views a shared collection they need to see other contributors'
-- photos. The moment-photos bucket is already public (direct URL reads bypass
-- RLS entirely), but this policy covers SDK-based reads for completeness.

CREATE POLICY "Users can view photos in shared collections"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'moment-photos'
    AND (
      -- Own photos (existing behaviour)
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      -- Photos belonging to a moment in a collection the user is a member of
      EXISTS (
        SELECT 1 FROM public.moments m
        JOIN public.collection_moments cm ON cm.moment_id = m.id
        JOIN public.collection_members cmb ON cmb.collection_id = cm.collection_id
        WHERE cmb.user_id = auth.uid()
          AND (storage.foldername(name))[1] = m.user_id::text
      )
      OR
      -- Photos belonging to a moment in a collection the user owns
      EXISTS (
        SELECT 1 FROM public.moments m
        JOIN public.collection_moments cm ON cm.moment_id = m.id
        JOIN public.collections c ON c.id = cm.collection_id
        WHERE c.user_id = auth.uid()
          AND (storage.foldername(name))[1] = m.user_id::text
      )
    )
  );
