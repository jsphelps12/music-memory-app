-- Enforce visibility on tagged-moment reads.
-- Old policy allowed tagged users to read ANY moment they were tagged in,
-- regardless of the owner's privacy setting. Now we scope it:
--   'connections' → tagged friends can see it
--   'link'        → tagged friends can also see it (they clearly have access)
--   'private'     → only the owner sees it (existing owner policy covers this)

DROP POLICY IF EXISTS "Tagged users can read moments they are tagged in" ON public.moments;
CREATE POLICY "Tagged users can read moments they are tagged in"
  ON public.moments FOR SELECT
  USING (
    visibility IN ('connections', 'link')
    AND EXISTS (
      SELECT 1 FROM public.tagged_moments
      WHERE moment_id = moments.id
        AND tagged_user_id = auth.uid()
        AND status != 'hidden'
    )
  );
