-- Album basics (owner decision 2026-11-20): an album's owner can invite a
-- friend from the share sheet's friend picker. The friend gets a push and
-- sees the invite at the top of Albums → Shared with Join / Not now. Joining
-- stays the friend's choice; nothing joins automatically.
--
-- Table name: `collection_invites` is taken. The baseline still carries the
-- old username-invite table of that name (id, inviter_id, invitee_id), kept
-- only for stranded build-7 binaries and due to be dropped by the build-23
-- caboose (docs/ROADMAP.md). Reusing it would tie this feature to that drop,
-- so friend invites get their own table.
--
-- Additive and idempotent: a new table, two new RPCs, nothing existing
-- changes. Old builds never touch any of it.

-- 1. The invites. One row per (album, invitee); a re-invite after the friend
--    joined and then left reuses the row (invite_to_album).
CREATE TABLE IF NOT EXISTS public.collection_friend_invites (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  from_user     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at  timestamptz,
  -- Set by notify-social when it claims the invite's one push.
  notified_at   timestamptz,
  PRIMARY KEY (collection_id, to_user),
  CHECK (from_user <> to_user)
);

-- Albums → Shared reads the invitee's pending invites; from_user backs the
-- auth.users cascade.
CREATE INDEX IF NOT EXISTS collection_friend_invites_to_user_idx
  ON public.collection_friend_invites (to_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_friend_invites_from_user_idx
  ON public.collection_friend_invites (from_user);

ALTER TABLE public.collection_friend_invites ENABLE ROW LEVEL SECURITY;

-- 2. Policies. None of them reads a table whose own policy reads this one,
--    so there is no policy recursion (see 20260801180000).

-- Only the invitee reads invite rows. The inviter must not learn whether a
-- friend said Not now: the picker's "Invited" state comes from
-- get_album_invitee_ids (below), which lists who has been asked without
-- saying how they answered.
DROP POLICY IF EXISTS "Inviter and invitee can view album invites" ON public.collection_friend_invites;
DROP POLICY IF EXISTS "Invitees can view their album invites" ON public.collection_friend_invites;
CREATE POLICY "Invitees can view their album invites"
  ON public.collection_friend_invites FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = to_user);

-- Only the album's owner invites, as themselves, into a shared album, and
-- only an accepted friend (either direction of the friendship row). The app
-- goes through invite_to_album; this keeps a direct insert to the same rule.
DROP POLICY IF EXISTS "Owners can invite friends to shared albums" ON public.collection_friend_invites;
CREATE POLICY "Owners can invite friends to shared albums"
  ON public.collection_friend_invites FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = from_user
    AND to_user <> from_user
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_friend_invites.collection_id
        AND c.user_id = (SELECT auth.uid())
        AND c.is_public = true
    )
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = collection_friend_invites.to_user)
          OR (f.requester_id = collection_friend_invites.to_user AND f.addressee_id = (SELECT auth.uid()))
        )
    )
  );

-- The invitee answers their own invite. Column privileges below confine the
-- update to status and responded_at, so the row can't be repointed at
-- another album or inviter.
DROP POLICY IF EXISTS "Invitees can answer album invites" ON public.collection_friend_invites;
CREATE POLICY "Invitees can answer album invites"
  ON public.collection_friend_invites FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = to_user)
  WITH CHECK (
    (SELECT auth.uid()) = to_user
    AND status IN ('accepted', 'declined')
  );

REVOKE UPDATE ON public.collection_friend_invites FROM anon, authenticated;
GRANT UPDATE (status, responded_at) ON public.collection_friend_invites TO authenticated;

-- The inviter can withdraw an invite that hasn't been answered. A declined
-- row stays, so "Not now" can't be undone by deleting it and inviting again.
DROP POLICY IF EXISTS "Inviters can withdraw album invites" ON public.collection_friend_invites;
CREATE POLICY "Inviters can withdraw album invites"
  ON public.collection_friend_invites FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = from_user AND status = 'pending');

-- Who the owner has asked into their album (pending or declined, without
-- saying which), for the picker's "Invited" state.
CREATE OR REPLACE FUNCTION public.get_album_invitee_ids(p_collection_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT i.to_user
    FROM public.collection_friend_invites i
    JOIN public.collections c ON c.id = i.collection_id
   WHERE i.collection_id = p_collection_id
     AND c.user_id = (SELECT auth.uid())
     AND i.status IN ('pending', 'declined');
$$;

REVOKE EXECUTE ON FUNCTION public.get_album_invitee_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_album_invitee_ids(uuid) TO authenticated;

-- 3. invite_to_album: the owner invites friends to a shared album. Returns how
--    many invites were created (or re-opened). Skipped without error: the
--    caller, non-friends, current members, anyone with a pending invite, and
--    anyone who said Not now (their answer stands; the link still works).
--    A friend who joined and then left can be invited again.
CREATE OR REPLACE FUNCTION public.invite_to_album(p_collection_id uuid, p_friend_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_friend_ids, 1), 0) > 50 THEN
    RAISE EXCEPTION 'too_many_invites' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = p_collection_id AND c.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = p_collection_id AND c.is_public = true
  ) THEN
    RAISE EXCEPTION 'album_not_shared' USING ERRCODE = '42501';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT f.id AS to_user
    FROM unnest(coalesce(p_friend_ids, '{}'::uuid[])) AS f(id)
    WHERE f.id IS NOT NULL
      AND f.id <> v_uid
      AND EXISTS (
        SELECT 1 FROM public.friendships fr
        WHERE fr.status = 'accepted'
          AND (
            (fr.requester_id = v_uid AND fr.addressee_id = f.id)
            OR (fr.requester_id = f.id AND fr.addressee_id = v_uid)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.collection_members m
        WHERE m.collection_id = p_collection_id AND m.user_id = f.id
      )
  ),
  written AS (
    INSERT INTO public.collection_friend_invites AS i (collection_id, from_user, to_user)
    SELECT p_collection_id, v_uid, c.to_user FROM candidates c
    ON CONFLICT (collection_id, to_user) DO UPDATE
      SET from_user    = excluded.from_user,
          status       = 'pending',
          created_at   = now(),
          responded_at = NULL,
          notified_at  = NULL
      WHERE i.status = 'accepted'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM written;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_to_album(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_album(uuid, uuid[]) TO authenticated;

-- 4. respond_to_album_invite: the invitee's Join / Not now.
--
--    SECURITY INVOKER on purpose: Join inserts the caller's collection_members
--    row through the same RLS policy that joining by link uses ("Users can
--    join or be added to collections": yourself, into a shared album), so
--    there is exactly one rule for who can join. The invite row is read and
--    answered through the invitee policies above.
--
--    Returns 'joined' (also when already a member), 'declined', 'no_invite'
--    (no invite for the caller, or one already used up), or 'unavailable'
--    (the album is gone or no longer shared).
CREATE OR REPLACE FUNCTION public.respond_to_album_invite(p_collection_id uuid, p_accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
  v_public boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT i.status INTO v_status
  FROM public.collection_friend_invites i
  WHERE i.collection_id = p_collection_id AND i.to_user = v_uid;
  IF NOT FOUND THEN
    RETURN 'no_invite';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.collection_friend_invites
    SET status = 'declined', responded_at = now()
    WHERE collection_id = p_collection_id AND to_user = v_uid AND status = 'pending';
    RETURN 'declined';
  END IF;

  IF v_status = 'accepted' THEN
    -- A second tap, or an invite used before the friend left the album.
    IF EXISTS (
      SELECT 1 FROM public.collection_members m
      WHERE m.collection_id = p_collection_id AND m.user_id = v_uid
    ) THEN
      RETURN 'joined';
    END IF;
    RETURN 'no_invite';
  END IF;

  -- Readable here only while shared (the collections SELECT policy).
  SELECT c.is_public INTO v_public FROM public.collections c WHERE c.id = p_collection_id;
  IF NOT coalesce(v_public, false) THEN
    RETURN 'unavailable';
  END IF;

  INSERT INTO public.collection_members (collection_id, user_id)
  VALUES (p_collection_id, v_uid)
  ON CONFLICT (collection_id, user_id) DO NOTHING;

  UPDATE public.collection_friend_invites
  SET status = 'accepted', responded_at = now()
  WHERE collection_id = p_collection_id AND to_user = v_uid;

  RETURN 'joined';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_album_invite(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_album_invite(uuid, boolean) TO authenticated;
