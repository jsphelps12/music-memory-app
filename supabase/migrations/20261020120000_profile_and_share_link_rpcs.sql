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

-- 2. Opening a /m/{share_token} link while signed in. A read-only lookup
--    tied to the token's current value: clearing or rotating share_token
--    ends access, and nothing is recorded for the caller. Returns NULL when
--    the token is malformed or matches no moment. For the owner it returns
--    only {"id", "is_owner": true} so the app opens the normal detail screen;
--    for anyone else, the public fields the /m page shows (as
--    get_shared_moment) plus what a read-only in-app view needs.
CREATE OR REPLACE FUNCTION public.open_shared_moment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  RETURN (
    SELECT CASE
      WHEN m.user_id = v_uid THEN
        jsonb_build_object('id', m.id, 'is_owner', true)
      ELSE
        jsonb_build_object(
          'id', m.id,
          'is_owner', false,
          'song_title', m.song_title,
          'song_artist', m.song_artist,
          'song_album_name', m.song_album_name,
          'song_artwork_url', m.song_artwork_url,
          'song_preview_url', m.song_preview_url,
          'song_apple_music_id', m.song_apple_music_id,
          'reflection_text', m.reflection_text,
          'photo_urls', m.photo_urls,
          'photo_thumbnails', m.photo_thumbnails,
          'moment_date', m.moment_date,
          'mood', m.mood,
          'moods', m.moods,
          'location', m.location,
          'sender_name', p.display_name,
          'sender_avatar_url', p.avatar_url,
          'sender_friend_token', p.friend_invite_token
        )
    END
    FROM public.moments m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.share_token = v_token
  );
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
