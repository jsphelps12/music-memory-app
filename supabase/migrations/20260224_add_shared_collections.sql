ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS invite_code      text,
  ADD COLUMN IF NOT EXISTS is_public        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cover_photo_url  text,
  ADD COLUMN IF NOT EXISTS date_from        date,
  ADD COLUMN IF NOT EXISTS date_to          date;

-- Backfill invite codes for existing rows
UPDATE public.collections
SET invite_code = substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE invite_code IS NULL;

-- Lock it down
ALTER TABLE public.collections
  ALTER COLUMN invite_code SET NOT NULL,
  ADD CONSTRAINT collections_invite_code_key UNIQUE (invite_code);

-- Auto-generate invite_code on INSERT if not provided
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invite_code
  BEFORE INSERT ON public.collections
  FOR EACH ROW EXECUTE FUNCTION generate_invite_code();
