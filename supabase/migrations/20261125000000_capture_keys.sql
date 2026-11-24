-- Capture keys (1.5, "Remember this song", docs/PLAN-1.5.md section 3).
--
-- Siri, Shortcuts and the Action button run an App Intent that saves the
-- playing song without opening the app. The intent can't use the app's
-- Supabase session (refreshing it would sign the app out), so on sign-in the
-- app asks the capture-key edge function for a capture key: a random secret
-- that can only add a moment for that one person. The phone keeps the secret
-- in its keychain; this table keeps only its SHA-256. The quick-capture edge
-- function looks a key up by that hash and saves the moment with the service
-- role as the key's owner.
--
-- Additive and idempotent: a new table, and the capture_source CHECK rebuilt
-- with one more value ('background'). No existing column, policy or function
-- changes, so every build in the wild is unaffected.

CREATE TABLE IF NOT EXISTS public.capture_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- sha256 hex of the secret. The secret itself is never stored.
  key_hash     text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  -- A random id the app makes once per install; a new key for the same
  -- install replaces the old one.
  device_id    text NOT NULL CHECK (device_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- What to call the device if keys are ever listed ("iPhone").
  device_label text CHECK (device_label IS NULL OR char_length(device_label) <= 80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

COMMENT ON TABLE public.capture_keys IS
  'Per-device secrets for saving a moment in the background (Siri, Shortcuts, Action button). Only the SHA-256 is stored. Written only by the capture-key and quick-capture edge functions (service role).';

-- One live key per install; a race between two requests from the same phone
-- ends in a unique violation the function retries, not two live keys.
CREATE UNIQUE INDEX IF NOT EXISTS capture_keys_live_device_idx
  ON public.capture_keys (user_id, device_id)
  WHERE revoked_at IS NULL;

-- The per-user counts (live keys, keys made in the last hour).
CREATE INDEX IF NOT EXISTS capture_keys_user_created_idx
  ON public.capture_keys (user_id, created_at);

ALTER TABLE public.capture_keys ENABLE ROW LEVEL SECURITY;

-- Clients may read their own keys' bookkeeping, never key_hash. Table-level
-- privileges (Supabase grants ALL on new public tables by default) are
-- replaced by a column grant; there is no client INSERT, UPDATE or DELETE.
REVOKE ALL ON public.capture_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, device_id, device_label, created_at, last_used_at, revoked_at)
  ON public.capture_keys TO authenticated;

DROP POLICY IF EXISTS "Owners can read their capture keys" ON public.capture_keys;
CREATE POLICY "Owners can read their capture keys"
  ON public.capture_keys
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);


-- capture_source gains 'background': a moment saved by quick-capture.
-- Same list as 20261120120000_song_metadata.sql plus that one value. Added
-- NOT VALID (no scan under the exclusive lock), then validated, which doesn't
-- block writes. Dropping first makes this repeatable.
ALTER TABLE public.moments DROP CONSTRAINT IF EXISTS moments_capture_source_check;
ALTER TABLE public.moments
  ADD CONSTRAINT moments_capture_source_check
  CHECK (
    capture_source IS NULL OR capture_source IN (
      'now_playing', 'identify', 'search', 'share', 'widget',
      'nudge', 'last_week', 'from_before', 'draft', 'other',
      'background'
    )
  ) NOT VALID;
ALTER TABLE public.moments VALIDATE CONSTRAINT moments_capture_source_check;

COMMENT ON COLUMN public.moments.capture_source IS
  'How the moment was captured (lib/captureSource.ts; ''background'' = quick-capture, Siri/Shortcuts/Action button). NULL for moments saved before 2026-11-20 or by older builds.';

NOTIFY pgrst, 'reload schema';
