-- 1. Track whether the user has customized their auto-generated username
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username_customized boolean NOT NULL DEFAULT false;

-- 2. Mark existing non-null usernames as customized (they were all user-set)
UPDATE profiles
SET username_customized = true
WHERE username IS NOT NULL;

-- 3. Backfill NULL usernames with a unique auto-generated placeholder
UPDATE profiles
SET username = 'user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE username IS NULL;

-- 4. Update handle_new_user() to auto-generate username on every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, username_customized)
  VALUES (
    new.id,
    'user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    false
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
