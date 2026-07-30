-- Re-engagement notifications had no cooldown: the "Still there?" message went
-- to every dormant user every single day, forever. With most of the user base
-- dormant, that is an uninstall driver rather than a re-engagement campaign.
--
-- This column lets send-notifications enforce a minimum gap between
-- re-engagement pushes per user.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reengagement_at timestamptz;

COMMENT ON COLUMN public.profiles.last_reengagement_at IS
  'When the user was last sent a Priority 5 re-engagement push. Enforces the cooldown in send-notifications.';

-- Backfill to now() for users who are already dormant, so deploying this does
-- not fire one more nag at everyone before the cooldown starts applying.
UPDATE public.profiles p
SET last_reengagement_at = now()
WHERE p.push_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.moments m
    WHERE m.user_id = p.id
      AND m.created_at < now() - interval '7 days'
  );
