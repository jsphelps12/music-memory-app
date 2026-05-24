ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year int,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS favorite_artists jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favorite_songs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Grandfather in existing users so they aren't forced through onboarding
UPDATE public.profiles
SET onboarding_completed = true
WHERE display_name IS NOT NULL;
