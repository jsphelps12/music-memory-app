-- Moment reactions (resonance)
CREATE TABLE public.moment_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  moment_id uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'resonance',
  created_at timestamptz DEFAULT now(),
  UNIQUE (moment_id, user_id)
);

ALTER TABLE public.moment_reactions ENABLE ROW LEVEL SECURITY;

-- Reactors can see their own reactions (to know their toggle state)
CREATE POLICY "Users can view their own reactions"
  ON public.moment_reactions FOR SELECT
  USING (auth.uid() = user_id);

-- Moment owners can see all reactions on their moments (to show the count)
CREATE POLICY "Owners can view reactions on their moments"
  ON public.moment_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.moments
      WHERE id = moment_id AND user_id = auth.uid()
    )
  );

-- Users can react to any moment they can access
CREATE POLICY "Users can insert their own reactions"
  ON public.moment_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own reactions
CREATE POLICY "Users can delete their own reactions"
  ON public.moment_reactions FOR DELETE
  USING (auth.uid() = user_id);
