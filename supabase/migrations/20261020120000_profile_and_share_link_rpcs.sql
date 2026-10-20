-- RLS hardening, expand (continued): two signed-in RPCs the app moves to
-- before step 2 narrows direct table reads. Additive only; no existing
-- behaviour changes for any client in the field.

-- 1. The caller's own full profile row. The app reads its own profile
--    (preferences, push token, onboarding state) through this instead of
--    selecting every column of `profiles` directly. Same shape as
--    `select("*")` on the table, so call it with `.rpc("get_my_profile").maybeSingle()`.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

-- 2. Opening a /m/{share_token} link while signed in. Resolves the token and,
--    when the caller isn't the owner, records a moment_shares row from the
--    owner to the caller, so the moment is readable through the normal
--    "shared with me" access rule and appears in the caller's inbox. The row
--    is marked viewed (the caller is opening it now). The owner can remove it
--    like any other share. Returns the moment id, or NULL when the token is
--    malformed, unknown or revoked.
CREATE OR REPLACE FUNCTION public.open_shared_moment(p_token text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_token     uuid;
  v_moment_id uuid;
  v_owner_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  SELECT m.id, m.user_id INTO v_moment_id, v_owner_id
  FROM public.moments m
  WHERE m.share_token = v_token;

  IF v_moment_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_owner_id IS DISTINCT FROM v_uid THEN
    INSERT INTO public.moment_shares (moment_id, sender_id, recipient_id, viewed_at)
    VALUES (v_moment_id, v_owner_id, v_uid, now())
    ON CONFLICT (moment_id, recipient_id) DO NOTHING;
  END IF;

  RETURN v_moment_id;
END;
$$;

-- 3. claim_gifted_moment (old builds only): the baseline already casts the
--    token to uuid, but a malformed token raised an error instead of the
--    documented silent no-op. Same behaviour otherwise.
CREATE OR REPLACE FUNCTION public.claim_gifted_moment(p_share_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token     uuid;
  v_moment_id uuid;
  v_owner_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  BEGIN
    v_token := p_share_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;

  SELECT id, user_id INTO v_moment_id, v_owner_id
  FROM public.moments
  WHERE share_token = v_token;

  IF v_moment_id IS NULL THEN RETURN; END IF;
  IF v_owner_id = auth.uid() THEN RETURN; END IF;

  INSERT INTO public.tagged_moments (moment_id, tagger_user_id, tagged_user_id)
  VALUES (v_moment_id, v_owner_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_shared_moment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_gifted_moment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_shared_moment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gifted_moment(text) TO authenticated;
