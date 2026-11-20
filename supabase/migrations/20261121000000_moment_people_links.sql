-- "Who was there" names linked to friends (2026-11-21, ROADMAP "Who was
-- there → friends").
--
-- moments.people stays the list of names the owner wrote. When the owner
-- picks a friend for a name, this table records that the name on that moment
-- is that friend's account. It is the owner's private note: only the owner
-- can read or write their rows, and nothing in the shared view
-- (moment_view_for), any RPC or any edge function reads it, so the friend is
-- never told unless the owner sends them the moment.
--
-- Unfriending keeps the names on the moments and drops the links between the
-- two people (trigger below). Deleting a moment, the owner or the friend's
-- profile drops the rows through the foreign keys.
--
-- Additive and idempotent. Builds in the wild never touch this table; the
-- 1.4.1 app reads and writes it only when it exists and behaves as before
-- when it doesn't (lib/momentPeopleLinks.ts), so the app may ship first.

CREATE TABLE IF NOT EXISTS public.moment_people_links (
  moment_id  uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  friend_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, friend_id),
  CONSTRAINT moment_people_links_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT moment_people_links_not_self CHECK (friend_id <> owner_id)
);

-- Rediscover's People and the unfriend trigger look links up by owner and friend.
CREATE INDEX IF NOT EXISTS moment_people_links_owner_friend_idx
  ON public.moment_people_links (owner_id, friend_id);
-- The unfriend trigger also deletes the other direction (friend_id, owner_id).
CREATE INDEX IF NOT EXISTS moment_people_links_friend_idx
  ON public.moment_people_links (friend_id);

ALTER TABLE public.moment_people_links ENABLE ROW LEVEL SECURITY;

-- Signed-in owners only; nobody signed out.
REVOKE ALL ON public.moment_people_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moment_people_links TO authenticated;

DROP POLICY IF EXISTS "Owners read their people links" ON public.moment_people_links;
CREATE POLICY "Owners read their people links"
  ON public.moment_people_links FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- A link needs the owner's own moment and an accepted friendship with the
-- friend (either direction; one row per pair since 20261119120000).
DROP POLICY IF EXISTS "Owners link names on their moments to friends" ON public.moment_people_links;
CREATE POLICY "Owners link names on their moments to friends"
  ON public.moment_people_links FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.moments m
      WHERE m.id = moment_id AND m.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = friend_id)
          OR (f.addressee_id = (SELECT auth.uid()) AND f.requester_id = friend_id)
        )
    )
  );

-- Renaming a linked name (upsert on conflict) goes through the same checks.
DROP POLICY IF EXISTS "Owners update their people links" ON public.moment_people_links;
CREATE POLICY "Owners update their people links"
  ON public.moment_people_links FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.moments m
      WHERE m.id = moment_id AND m.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = friend_id)
          OR (f.addressee_id = (SELECT auth.uid()) AND f.requester_id = friend_id)
        )
    )
  );

DROP POLICY IF EXISTS "Owners remove their people links" ON public.moment_people_links;
CREATE POLICY "Owners remove their people links"
  ON public.moment_people_links FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Unfriending drops the links between the two people, both ways. Runs as
-- definer: the person removing the friendship can't delete the other
-- person's rows through RLS.
CREATE OR REPLACE FUNCTION public.drop_people_links_on_unfriend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      DELETE FROM public.moment_people_links l
      WHERE (l.owner_id = OLD.requester_id AND l.friend_id = OLD.addressee_id)
         OR (l.owner_id = OLD.addressee_id AND l.friend_id = OLD.requester_id);
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: no longer accepted, or the pair itself changed.
  IF OLD.status = 'accepted'
     AND (
       NEW.status IS DISTINCT FROM 'accepted'
       OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
       OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id
     ) THEN
    DELETE FROM public.moment_people_links l
    WHERE (l.owner_id = OLD.requester_id AND l.friend_id = OLD.addressee_id)
       OR (l.owner_id = OLD.addressee_id AND l.friend_id = OLD.requester_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.drop_people_links_on_unfriend() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS friendships_drop_people_links ON public.friendships;
CREATE TRIGGER friendships_drop_people_links
  AFTER DELETE OR UPDATE OF status, requester_id, addressee_id ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.drop_people_links_on_unfriend();
