-- profile_visibility defaulted to 'friends_only', making users invisible to
-- username search before any friendship exists. Change to 'public' so users
-- can be found and added as friends.

ALTER TABLE public.profiles
  ALTER COLUMN profile_visibility SET DEFAULT 'public';

-- Backfill existing rows that have the old 'friends_only' default.
-- Any user who explicitly chose 'friends_only' would have had to do so
-- in a settings UI that doesn't exist yet, so all current rows with
-- 'friends_only' got that value from the column default and should be updated.
UPDATE public.profiles
  SET profile_visibility = 'public'
  WHERE profile_visibility = 'friends_only';
