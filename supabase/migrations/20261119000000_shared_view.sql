-- The shared view, step 1 (docs/ROADMAP.md, "Sharing work, in order").
--
-- Everyone but a moment's owner reads it through one shaping function,
-- moment_view_for(): the owner gets the full row; anyone else gets it
-- without the share link token, the place (location text and coordinates)
-- or the people's names, and with linked media's Photos ids blanked. Owner
-- decision 2026-11-18: those stay with the owner, and only the owner can
-- pass a moment on.
--
-- Adds:
--   moment_view_for(moments, uuid)  the shaping helper (no client may call it)
--   get_moment_view(uuid)           one moment, for anyone allowed to see it
--   get_shared_with_me(int, int)    the "Shared with you" inbox
-- Changes (same signatures and keys; non-owners now get the shaped fields):
--   get_shared_collection_moments(uuid), open_shared_moment(text),
--   get_shared_moment(text)
--
-- Additive and safe for every app build in the wild: no policy changes, no
-- dropped or narrowed signatures. Hidden fields come back as null (place) or
-- an empty array (people), which every build since 1.3.1 already renders as
-- "not set". Making the moments table owner-only is step 2 (with DB-2, after
-- the min-build raise).

-- 1. The shaping helper. Called only from the definer functions below.
CREATE OR REPLACE FUNCTION public.moment_view_for(p_moment public.moments, p_viewer uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_viewer IS NOT NULL AND (p_moment).user_id = p_viewer THEN to_jsonb(p_moment)
    ELSE (to_jsonb(p_moment) - 'share_token')
      || jsonb_build_object(
        'location', NULL,
        'location_lat', NULL,
        'location_lng', NULL,
        'people', '[]'::jsonb,
        'media_refs',
        COALESCE(
          (SELECT jsonb_agg(
                    CASE WHEN jsonb_typeof(r.ref) = 'object'
                         THEN r.ref || '{"cloudId": ""}'::jsonb
                         ELSE r.ref END
                    ORDER BY r.ord)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof((p_moment).media_refs) = 'array'
                         THEN (p_moment).media_refs ELSE '[]'::jsonb END
                  ) WITH ORDINALITY AS r(ref, ord)),
          '[]'::jsonb)
      )
      || COALESCE(
        (SELECT jsonb_build_object(
                  'owner_display_name', pr.display_name,
                  'owner_avatar_url', pr.avatar_url)
           FROM public.profiles pr
          WHERE pr.id = (p_moment).user_id),
        '{}'::jsonb)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.moment_view_for(public.moments, uuid) FROM PUBLIC, anon, authenticated;

-- 2. One moment, shaped for the caller. Access mirrors the moments SELECT
--    policy's branches for signed-in users: the owner, the owner of an album
--    holding it, a member of such an album, or someone it was sent to. A
--    share link is not access here: links open through open_shared_moment.
--    NULL when the moment doesn't exist or the caller can't see it.
CREATE OR REPLACE FUNCTION public.get_moment_view(p_moment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR p_moment_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT public.moment_view_for(m, v_uid)
    FROM public.moments m
    WHERE m.id = p_moment_id
      AND (
        m.user_id = v_uid
        OR EXISTS (
          SELECT 1
          FROM public.collection_moments cm
          JOIN public.collections c ON c.id = cm.collection_id
          WHERE cm.moment_id = m.id
            AND c.user_id = v_uid
        )
        OR EXISTS (
          SELECT 1
          FROM public.collection_moments cm
          JOIN public.collection_members cmb ON cmb.collection_id = cm.collection_id
          WHERE cm.moment_id = m.id
            AND cmb.user_id = v_uid
        )
        OR EXISTS (
          SELECT 1
          FROM public.moment_shares ms
          WHERE ms.moment_id = m.id
            AND ms.recipient_id = v_uid
        )
      )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_moment_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_moment_view(uuid) TO authenticated;

-- 3. "Shared with you": the caller's received shares, newest first, each
--    with its sender and the shaped moment under "moments" (the key the
--    app's share-row mapping already reads). Paged by limit/offset; the
--    default matches the app's single 200-row fetch.
CREATE OR REPLACE FUNCTION public.get_shared_with_me(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', ms.id,
    'sender_id', ms.sender_id,
    'created_at', ms.created_at,
    'viewed_at', ms.viewed_at,
    'sender_name', p.display_name,
    'sender_avatar_url', p.avatar_url,
    'moments', public.moment_view_for(m, v_uid)
  )
  FROM public.moment_shares ms
  JOIN public.moments m ON m.id = ms.moment_id
  LEFT JOIN public.profiles p ON p.id = ms.sender_id
  WHERE ms.recipient_id = v_uid
  ORDER BY ms.created_at DESC, ms.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shared_with_me(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_with_me(integer, integer) TO authenticated;

-- 4. A shared album's moments: same access check, order and extra keys as
--    20261118000000; each moment now goes through the shaping helper.
CREATE OR REPLACE FUNCTION public.get_shared_collection_moments(p_collection_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR (
    NOT EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = p_collection_id AND user_id = v_uid
    ) AND NOT EXISTS (
      SELECT 1 FROM public.collection_members
      WHERE collection_id = p_collection_id AND user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    public.moment_view_for(m, v_uid)
    || jsonb_build_object(
      'contributor_name',
        CASE
          WHEN m.guest_uuid IS NOT NULL AND m.guest_name IS NOT NULL THEN m.guest_name
          ELSE COALESCE(p.display_name, owner.display_name)
        END,
      'added_by_user_id', cm.added_by_user_id
    )
  FROM public.collection_moments cm
  JOIN public.moments m ON m.id = cm.moment_id
  LEFT JOIN public.profiles p ON p.id = cm.added_by_user_id
  LEFT JOIN public.profiles owner ON owner.id = m.user_id
  WHERE cm.collection_id = p_collection_id
  ORDER BY cm.added_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_collection_moments(uuid) TO authenticated;

-- 5. Opening a /m/ link signed in: same keys as 20261020120000. The owner
--    still gets {"id", "is_owner": true}; anyone else gets the fields picked
--    from the shaped view, so "location" is now null.
CREATE OR REPLACE FUNCTION public.open_shared_moment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_token   uuid;
  v_moment  public.moments;
  v_view    jsonb;
  v_name    text;
  v_avatar  text;
  v_friend  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  SELECT m.* INTO v_moment FROM public.moments m WHERE m.share_token = v_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_moment.user_id = v_uid THEN
    RETURN jsonb_build_object('id', v_moment.id, 'is_owner', true);
  END IF;

  v_view := public.moment_view_for(v_moment, v_uid);
  SELECT p.display_name, p.avatar_url, p.friend_invite_token
    INTO v_name, v_avatar, v_friend
    FROM public.profiles p
   WHERE p.id = v_moment.user_id;

  RETURN jsonb_build_object(
    'id', v_view->'id',
    'is_owner', false,
    'song_title', v_view->'song_title',
    'song_artist', v_view->'song_artist',
    'song_album_name', v_view->'song_album_name',
    'song_artwork_url', v_view->'song_artwork_url',
    'song_preview_url', v_view->'song_preview_url',
    'song_apple_music_id', v_view->'song_apple_music_id',
    'reflection_text', v_view->'reflection_text',
    'photo_urls', v_view->'photo_urls',
    'photo_thumbnails', v_view->'photo_thumbnails',
    'moment_date', v_view->'moment_date',
    'mood', v_view->'mood',
    'moods', v_view->'moods',
    'location', v_view->'location',
    'sender_name', v_name,
    'sender_avatar_url', v_avatar,
    'sender_friend_token', v_friend
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_shared_moment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_shared_moment(text) TO authenticated;

-- 6. The /m/ web page (signed out): same keys as 20261020000000, picked from
--    the shaped view, so "location" is now null.
CREATE OR REPLACE FUNCTION public.get_shared_moment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token   uuid;
  v_moment  public.moments;
  v_view    jsonb;
  v_name    text;
  v_friend  uuid;
BEGIN
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  SELECT m.* INTO v_moment FROM public.moments m WHERE m.share_token = v_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_view := public.moment_view_for(v_moment, (SELECT auth.uid()));
  SELECT p.display_name, p.friend_invite_token
    INTO v_name, v_friend
    FROM public.profiles p
   WHERE p.id = v_moment.user_id;

  RETURN jsonb_build_object(
    'id', v_view->'id',
    'song_title', v_view->'song_title',
    'song_artist', v_view->'song_artist',
    'song_album_name', v_view->'song_album_name',
    'song_artwork_url', v_view->'song_artwork_url',
    'song_preview_url', v_view->'song_preview_url',
    'reflection_text', v_view->'reflection_text',
    'photo_urls', v_view->'photo_urls',
    'moment_date', v_view->'moment_date',
    'mood', v_view->'mood',
    'location', v_view->'location',
    'sender_name', v_name,
    'sender_friend_token', v_friend
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shared_moment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_moment(text) TO anon, authenticated;
