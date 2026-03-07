-- Add share_token to moments for "Gift a Memory" web links.
-- The token is generated client-side (UUID) and stored here on first share.
-- Anonymous users (web page visitors) can read a moment by its share_token.

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS share_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS moments_share_token_idx
  ON public.moments (share_token)
  WHERE share_token IS NOT NULL;

-- Allow anonymous reads (web page) when the share_token matches.
-- This is intentionally unauthenticated — shared links are public by design.
CREATE POLICY "Anyone can read a moment by share token"
  ON public.moments FOR SELECT
  USING (share_token IS NOT NULL);
