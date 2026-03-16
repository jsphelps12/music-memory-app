-- Allow collection owners to moderate their collections:
-- 1. Remove any moment (by members or guests) from the collection
-- 2. Delete guest moments entirely (guests have no personal account)

-- 1. Owner can remove any moment from their collection
CREATE POLICY "Collection owners can remove moments from their collections"
  ON public.collection_moments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_moments.collection_id
        AND user_id = auth.uid()
    )
  );

-- 2. Owner can delete guest moments in their collections
--    (guest_uuid NOT NULL distinguishes guest moments from regular member moments)
CREATE POLICY "Collection owners can delete guest moments in their collections"
  ON public.moments FOR DELETE
  USING (
    moments.guest_uuid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.collection_moments cm
      JOIN public.collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id
        AND c.user_id = auth.uid()
    )
  );
