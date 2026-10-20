-- Tightening from the 2026-10-19 full review. Safe for every client in the
-- field: current builds only send moments to accepted friends, and no client
-- writes collections.guest_user_id (create-guest-user sets it with the
-- service role).

-- 1. Sending a moment requires an accepted friendship with the recipient,
--    matching the share sheet, which only lists friends. The check goes
--    through a SECURITY DEFINER helper (same reason as owns_moment: no policy
--    expansion inside a policy). It only answers about the caller.
CREATE OR REPLACE FUNCTION public.is_friends_with(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = p_other)
        OR (f.addressee_id = (SELECT auth.uid()) AND f.requester_id = p_other)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_friends_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friends_with(uuid) TO authenticated;

ALTER POLICY "Owners can send their moments"
ON public.moment_shares
WITH CHECK (
  (SELECT auth.uid()) = sender_id
  AND public.owns_moment(moment_id)
  AND public.is_friends_with(recipient_id)
);

-- 2. collections.guest_user_id is server-managed (create-guest-user). Keep
--    API clients from setting or changing it; the service role is unaffected.
CREATE OR REPLACE FUNCTION public.protect_collection_guest_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.guest_user_id := NULL;
    ELSE
      NEW.guest_user_id := OLD.guest_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_collection_guest_user_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_collection_guest_user_id ON public.collections;
CREATE TRIGGER protect_collection_guest_user_id
  BEFORE INSERT OR UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.protect_collection_guest_user_id();
