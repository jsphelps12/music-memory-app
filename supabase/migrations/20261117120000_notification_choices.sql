-- Notification choices (1.4, Josh 2026-11-17). One "How often" setting over
-- memories coming back, a switch for friends, quiet nights, and the Sunday
-- "Last week is ready" reminder. Streak reminders, "still there?" and the
-- Tue/Thu prompts are retired in send-notifications (notifications about
-- absence break principle 3); their old columns stay for 1.3.1 clients.
--
-- notif_frequency: how far apart memories may come (daily 1 day, few 3,
--   weekly 7, off none). Covers On this day and random memories. Friends
--   and the user's own check-in aren't counted.
-- notif_social: shares and new friends (notify-social, accept-friend-invite).
-- notif_quiet_hours: friends' pushes between 10pm and 8am local arrive
--   silently (iOS "passive"), never dropped.
-- notif_last_week: the local "Last week is ready" reminder, Sunday 6pm.
-- last_notified_at: when send-notifications last sent this user anything;
--   the spacing behind notif_frequency.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_frequency text NOT NULL DEFAULT 'few',
  ADD COLUMN IF NOT EXISTS notif_social boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_quiet_hours boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_last_week boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_notif_frequency_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_notif_frequency_check
      CHECK (notif_frequency IN ('daily', 'few', 'weekly', 'off'));
  END IF;
END $$;
