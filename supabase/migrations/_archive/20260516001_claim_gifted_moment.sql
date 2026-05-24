-- RPC: claim a gifted moment by share_token
-- Inserts a tagged_moments row so the moment surfaces in the recipient's With Me.
-- Runs SECURITY DEFINER so the recipient can insert as the tagger (the owner).
CREATE OR REPLACE FUNCTION public.claim_gifted_moment(p_share_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moment_id uuid;
  v_owner_id uuid;
BEGIN
  SELECT id, user_id INTO v_moment_id, v_owner_id
  FROM public.moments
  WHERE share_token = p_share_token;

  -- Token not found — silently no-op
  IF v_moment_id IS NULL THEN RETURN; END IF;

  -- Don't claim your own moment
  IF v_owner_id = auth.uid() THEN RETURN; END IF;

  -- Insert into tagged_moments; ignore if already there
  INSERT INTO public.tagged_moments (moment_id, tagger_user_id, tagged_user_id)
  VALUES (v_moment_id, v_owner_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$$;
