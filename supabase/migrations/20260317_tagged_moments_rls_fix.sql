-- Allow tagged users to read moments they are tagged in
-- Required for fetchTaggedMomentsInbox and fetchAcceptedTaggedMoments batch fetches to work

CREATE POLICY "Tagged users can read moments they are tagged in"
  ON public.moments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tagged_moments
      WHERE moment_id = moments.id
        AND tagged_user_id = auth.uid()
    )
  );
