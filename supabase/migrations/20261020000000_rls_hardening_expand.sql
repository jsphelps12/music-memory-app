-- RLS hardening, step 1 of 2 (expand). Findings from the 2026-10-19 full review.
--
-- Everything here is safe for every client in the field (App Store builds,
-- both OTA channels, the web pages): it tightens rules no client relies on and
-- adds narrow lookup functions the web pages switch to in this same change.
-- Step 2 follows once the app has moved over too.
--
-- Note: the web pages use the ANON key (web/lib/supabase.ts), not the service
-- role as 20261017000000's header says.

-- 1. collection_moments INSERT never checked the moment. Linking someone
--    else's moment into your own album gave permanent read through the
--    "own album" branch of the moments SELECT policy, and for guest moments
--    it also satisfied the moments DELETE guest branch. Prod has no rows
--    where the adder doesn't own the moment (guest rows are inserted by
--    submit-guest-contribution with the service role, which bypasses RLS).
DROP POLICY IF EXISTS "Can insert collection_moments" ON public.collection_moments;
CREATE POLICY "Can insert collection_moments"
  ON public.collection_moments FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_moment(moment_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.collections
        WHERE collections.id = collection_moments.collection_id
          AND collections.user_id = (SELECT auth.uid())
      )
      OR (
        added_by_user_id = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.collection_members
          WHERE collection_members.collection_id = collection_moments.collection_id
            AND collection_members.user_id = (SELECT auth.uid())
        )
      )
    )
  );

-- 2. collection_members INSERT let a user add themselves to ANY album,
--    private ones included. Joining is by invite link only, and joinAlbum
--    (lib/albums.ts) only ever joins public albums looked up by invite code.
DROP POLICY IF EXISTS "Users can join or be added to collections" ON public.collection_members;
CREATE POLICY "Users can join or be added to collections"
  ON public.collection_members FOR INSERT
  WITH CHECK (
    (
      (SELECT auth.uid()) = user_id
      AND EXISTS (
        SELECT 1 FROM public.collections
        WHERE collections.id = collection_members.collection_id
          AND collections.is_public = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.collections
      WHERE collections.id = collection_members.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
  );

-- 3. friendships INSERT didn't constrain status, so anyone could insert an
--    'accepted' friendship with any user and read their friend-visible
--    moments. Friendships are created only by accept-friend-invite with the
--    service role; no client inserts them.
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;

-- 4. tagged_moments UPDATE had no WITH CHECK, so either party could repoint
--    moment_id at any moment and read it through get_tagged_moment_data.
--    No current client writes this table; claim_gifted_moment (SECURITY
--    DEFINER) still inserts as the function owner.
REVOKE INSERT, UPDATE ON public.tagged_moments FROM anon, authenticated;

-- 5. Row-scoped UPDATE policies only check who you are, not what you change,
--    so a permitted row could be repointed (a membership at another album, a
--    share or friendship at another moment or user). Grant UPDATE only on the
--    columns clients actually write, and keep moments/profiles from being
--    handed to another user. Client writes, for reference:
--      collection_members: last_viewed_at   (lib/albums.ts)
--      moment_shares:      viewed_at        (lib/momentShares.ts)
--      friendships:        none (accept-friend-invite uses the service role;
--                          old builds may still set status)
REVOKE UPDATE ON public.collection_members FROM anon, authenticated;
GRANT UPDATE (last_viewed_at) ON public.collection_members TO authenticated;

REVOKE UPDATE ON public.moment_shares FROM anon, authenticated;
GRANT UPDATE (viewed_at) ON public.moment_shares TO authenticated;

REVOKE UPDATE ON public.friendships FROM anon, authenticated;
GRANT UPDATE (status, updated_at) ON public.friendships TO authenticated;

DROP POLICY IF EXISTS "Users can update their own moments" ON public.moments;
CREATE POLICY "Users can update their own moments"
  ON public.moments FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- 6. Storage drift: the baseline's "Anyone can read photos" SELECT policy let
--    anyone LIST every user's photo paths. Prod already replaced it with an
--    own-folder policy outside any migration; staging still has the original.
--    Public URLs don't need a SELECT policy (the bucket is public), so this
--    only limits listing and API downloads to your own folder.
DROP POLICY IF EXISTS "Anyone can read photos" ON storage.objects;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can view their own photos'
  ) THEN
    CREATE POLICY "Users can view their own photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'moment-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- 7. Narrow public lookups for the web pages, replacing direct table reads.
--    Each returns only what the page already shows.

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_ids uuid[])
RETURNS TABLE (id uuid, display_name text, avatar_url text, username text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.username
  FROM public.profiles p
  WHERE p.id = ANY(p_ids[1:200]);
$$;

CREATE OR REPLACE FUNCTION public.get_profile_by_invite_token(p_token text)
RETURNS TABLE (id uuid, display_name text, avatar_url text, username text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token uuid;
BEGIN
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.username
  FROM public.profiles p
  WHERE p.friend_invite_token = v_token;
END;
$$;

-- The /m/{token} page: the moment's public fields plus the sender's name and
-- friend invite token (the page's "add {sender}" link exposes it by design).
CREATE OR REPLACE FUNCTION public.get_shared_moment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token uuid;
BEGIN
  BEGIN
    v_token := p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  RETURN (
  SELECT jsonb_build_object(
    'id', m.id,
    'song_title', m.song_title,
    'song_artist', m.song_artist,
    'song_album_name', m.song_album_name,
    'song_artwork_url', m.song_artwork_url,
    'song_preview_url', m.song_preview_url,
    'reflection_text', m.reflection_text,
    'photo_urls', m.photo_urls,
    'moment_date', m.moment_date,
    'mood', m.mood,
    'location', m.location,
    'sender_name', p.display_name,
    'sender_friend_token', p.friend_invite_token
  )
  FROM public.moments m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.share_token = v_token
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile_by_invite_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_shared_moment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_invite_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_moment(text) TO anon, authenticated;
