-- capture_source gains 'your_day' (1.5): a moment started from Apple's
-- Journaling Suggestions picker (long-press + → Start from → "Your day
-- (Apple)"; lib/captureSource.ts).
--
-- Same list as 20261125000000_capture_keys.sql plus that one value. Nothing
-- else changes, so every build in the wild is unaffected; until this is
-- applied, a 1.5 save with 'your_day' is retried without capture_source
-- (lib/optionalColumns.ts), so it saves with the column left empty.
--
-- Idempotent: the constraint is dropped if present and added again. Added
-- NOT VALID (no scan under the exclusive lock), then validated, which doesn't
-- block writes.
ALTER TABLE public.moments DROP CONSTRAINT IF EXISTS moments_capture_source_check;
ALTER TABLE public.moments
  ADD CONSTRAINT moments_capture_source_check
  CHECK (
    capture_source IS NULL OR capture_source IN (
      'now_playing', 'identify', 'search', 'share', 'widget',
      'nudge', 'last_week', 'from_before', 'draft', 'other',
      'background', 'your_day'
    )
  ) NOT VALID;
ALTER TABLE public.moments VALIDATE CONSTRAINT moments_capture_source_check;

COMMENT ON COLUMN public.moments.capture_source IS
  'How the moment was captured (lib/captureSource.ts; ''background'' = quick-capture, Siri/Shortcuts/Action button; ''your_day'' = Apple''s Journaling Suggestions picker). NULL for moments saved before 2026-11-20 or by older builds.';

NOTIFY pgrst, 'reload schema';
