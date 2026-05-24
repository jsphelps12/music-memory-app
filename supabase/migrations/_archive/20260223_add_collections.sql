CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX collections_user_id_idx ON public.collections(user_id);
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collections"
  ON public.collections FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.collection_moments (
  collection_id uuid NOT NULL REFERENCES public.collections ON DELETE CASCADE,
  moment_id uuid NOT NULL REFERENCES public.moments ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (collection_id, moment_id)
);
ALTER TABLE public.collection_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collection_moments"
  ON public.collection_moments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );
