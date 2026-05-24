-- When a profile's push_token is set, automatically clear that same token
-- from every other profile. This ensures only the currently signed-in account
-- on a device receives push notifications, even if multiple accounts have
-- been used on that device.
--
-- Runs as SECURITY DEFINER (bypasses RLS) because a user cannot UPDATE
-- another user's profile row under the standard per-user RLS policy.

CREATE OR REPLACE FUNCTION evict_push_token_from_other_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.push_token IS NOT NULL THEN
    UPDATE profiles
    SET push_token = NULL
    WHERE push_token = NEW.push_token
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evict_push_token ON profiles;

CREATE TRIGGER evict_push_token
  AFTER INSERT OR UPDATE OF push_token ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION evict_push_token_from_other_profiles();
