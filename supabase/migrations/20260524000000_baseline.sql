-- ============================================================
-- Baseline migration: complete production schema as of 2026-05-24
-- Replaces all 44 previous incremental migration files.
-- Apply to a fresh Supabase project via SQL Editor.
-- ============================================================

-- Extensions
-- pg_trgm powers the fuzzy-search GIN indexes on moments
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- UTILITY FUNCTIONS (no table deps — needed by triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLES (in foreign-key dependency order)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name            text,
  avatar_url              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  custom_moods            jsonb DEFAULT '[]'::jsonb,
  push_token              text,
  custom_prompt_categories jsonb DEFAULT '[]'::jsonb,
  birth_year              integer,
  country                 text,
  favorite_artists        jsonb NOT NULL DEFAULT '[]'::jsonb,
  favorite_songs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  onboarding_completed    boolean NOT NULL DEFAULT false,
  notif_on_this_day       boolean DEFAULT true,
  notif_streak            boolean DEFAULT true,
  notif_prompts           boolean DEFAULT true,
  notif_resurfacing       boolean DEFAULT true,
  genre_preferences       text[] DEFAULT '{}'::text[],
  notif_milestones        boolean DEFAULT true,
  timezone                text,
  username                text UNIQUE,
  friend_invite_token     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  profile_visibility      text NOT NULL DEFAULT 'friends_only'::text,
  username_customized     boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.moments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_title          text NOT NULL,
  song_artist         text NOT NULL,
  song_album_name     text,
  song_artwork_url    text,
  song_apple_music_id text NOT NULL,
  reflection_text     text NOT NULL DEFAULT ''::text,
  photo_urls          text[] DEFAULT '{}'::text[],
  mood                text,
  people              text[] DEFAULT '{}'::text[],
  location            text,
  moment_date         date DEFAULT CURRENT_DATE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  song_preview_url    text,
  photo_thumbnails    text[] DEFAULT '{}'::text[],
  time_of_day         text,
  share_token         uuid,
  guest_name          text,
  guest_uuid          text,
  location_lat        float8,
  location_lng        float8,
  visibility          text NOT NULL DEFAULT 'private'::text,
  weather_temp_f      integer,
  weather_condition   text
);

CREATE TABLE IF NOT EXISTS public.collections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  invite_code          text NOT NULL UNIQUE,
  is_public            boolean NOT NULL DEFAULT false,
  cover_photo_url      text,
  date_from            date,
  date_to              date,
  guest_user_id        uuid,
  events_tier_unlocked boolean NOT NULL DEFAULT true,
  owner_last_viewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.collection_members (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at     timestamptz DEFAULT now(),
  last_viewed_at timestamptz,
  PRIMARY KEY (collection_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.collection_moments (
  collection_id    uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  moment_id        uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  added_at         timestamptz DEFAULT now(),
  added_by_user_id uuid,
  PRIMARY KEY (collection_id, moment_id)
);

CREATE TABLE IF NOT EXISTS public.collection_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  inviter_id    uuid NOT NULL,
  invitee_id    uuid NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (collection_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  uuid NOT NULL,
  addressee_id  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending'::text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS public.tagged_moments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id      uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  tagger_user_id uuid NOT NULL,
  tagged_user_id uuid NOT NULL,
  released       boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'pending'::text,
  tag_token      uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (moment_id, tagged_user_id)
);

CREATE TABLE IF NOT EXISTS public.moment_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  type       text NOT NULL DEFAULT 'resonance'::text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (moment_id, user_id)
);

-- ============================================================
-- FUNCTIONS (table-referencing — created after tables)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, username_customized)
  VALUES (
    NEW.id,
    'user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    false
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.evict_push_token_from_other_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.check_moment_owner(p_moment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moments
    WHERE id = p_moment_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_gifted_moment(p_share_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_moment_id uuid;
  v_owner_id  uuid;
BEGIN
  SELECT id, user_id INTO v_moment_id, v_owner_id
  FROM public.moments
  WHERE share_token = p_share_token::uuid;

  IF v_moment_id IS NULL THEN RETURN; END IF;
  IF v_owner_id = auth.uid() THEN RETURN; END IF;

  INSERT INTO public.tagged_moments (moment_id, tagger_user_id, tagged_user_id)
  VALUES (v_moment_id, v_owner_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_random_moment()
RETURNS SETOF public.moments
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM moments
  WHERE user_id = auth.uid()
  ORDER BY RANDOM()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_random_forgotten_moment(p_cutoff timestamp with time zone)
RETURNS SETOF public.moments
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM moments
  WHERE user_id = auth.uid()
    AND created_at < p_cutoff
  ORDER BY RANDOM()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_tagged_moment_data(p_moment_ids uuid[])
RETURNS TABLE(
  id                 uuid,
  moment_date        date,
  created_at         timestamptz,
  song_title         text,
  song_artist        text,
  song_album_name    text,
  song_artwork_url   text,
  song_apple_music_id text,
  song_preview_url   text,
  mood               text,
  photo_urls         text[],
  photo_thumbnails   text[],
  reflection_text    text,
  guest_name         text,
  guest_uuid         text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    m.id, m.moment_date, m.created_at, m.song_title, m.song_artist,
    m.song_album_name, m.song_artwork_url, m.song_apple_music_id,
    m.song_preview_url, m.mood, m.photo_urls, m.photo_thumbnails,
    m.reflection_text, m.guest_name, m.guest_uuid
  FROM moments m
  INNER JOIN tagged_moments tm
    ON tm.moment_id = m.id AND tm.tagged_user_id = auth.uid()
  WHERE m.id = ANY(p_moment_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_shared_collection_moments(p_collection_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.collections
    WHERE id = p_collection_id
      AND (user_id = auth.uid() OR is_public = true)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.collection_members
    WHERE collection_id = p_collection_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT to_jsonb(m.*) || jsonb_build_object(
    'contributor_name',
      CASE
        WHEN m.guest_uuid IS NOT NULL AND m.guest_name IS NOT NULL THEN m.guest_name
        ELSE COALESCE(p.display_name, owner.display_name)
      END,
    'added_by_user_id', cm.added_by_user_id
  )
  FROM collection_moments cm
  JOIN moments m ON m.id = cm.moment_id
  LEFT JOIN profiles p ON p.id = cm.added_by_user_id
  LEFT JOIN profiles owner ON owner.id = m.user_id
  WHERE cm.collection_id = p_collection_id
  ORDER BY cm.added_at DESC;
END;
$$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS moments_user_id_idx         ON public.moments USING btree (user_id);
CREATE INDEX IF NOT EXISTS moments_moment_date_idx     ON public.moments USING btree (moment_date DESC);
CREATE INDEX IF NOT EXISTS moments_user_date_idx       ON public.moments USING btree (user_id, moment_date DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_share_token     ON public.moments USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE INDEX IF NOT EXISTS moments_title_trgm          ON public.moments USING gin (song_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS moments_artist_trgm         ON public.moments USING gin (song_artist gin_trgm_ops);
CREATE INDEX IF NOT EXISTS moments_reflection_trgm     ON public.moments USING gin (reflection_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS moments_location_trgm       ON public.moments USING gin (location gin_trgm_ops);
CREATE INDEX IF NOT EXISTS moments_people_gin          ON public.moments USING gin (people);

CREATE INDEX IF NOT EXISTS collections_user_id_idx     ON public.collections USING btree (user_id);
CREATE INDEX IF NOT EXISTS collections_guest_user_id_idx ON public.collections USING btree (guest_user_id);

CREATE INDEX IF NOT EXISTS collection_members_collection_id_idx ON public.collection_members USING btree (collection_id);
CREATE INDEX IF NOT EXISTS collection_members_user_id_idx       ON public.collection_members USING btree (user_id);

CREATE INDEX IF NOT EXISTS collection_moments_collection_id_idx  ON public.collection_moments USING btree (collection_id);
CREATE INDEX IF NOT EXISTS collection_moments_moment_id_idx      ON public.collection_moments USING btree (moment_id);
CREATE INDEX IF NOT EXISTS collection_moments_added_by_user_id_idx ON public.collection_moments USING btree (added_by_user_id);

CREATE INDEX IF NOT EXISTS collection_invites_collection_id_idx ON public.collection_invites USING btree (collection_id);
CREATE INDEX IF NOT EXISTS collection_invites_invitee_id_idx    ON public.collection_invites USING btree (invitee_id);
CREATE INDEX IF NOT EXISTS collection_invites_inviter_id_idx    ON public.collection_invites USING btree (inviter_id);

CREATE INDEX IF NOT EXISTS friendships_requester_idx  ON public.friendships USING btree (requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx  ON public.friendships USING btree (addressee_id, status);

CREATE INDEX IF NOT EXISTS tagged_moments_tagged_user_idx  ON public.tagged_moments USING btree (tagged_user_id, released, status);
CREATE INDEX IF NOT EXISTS tagged_moments_tagger_user_idx  ON public.tagged_moments USING btree (tagger_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);

CREATE INDEX IF NOT EXISTS moment_reactions_moment_id_idx ON public.moment_reactions USING btree (moment_id);
CREATE INDEX IF NOT EXISTS moment_reactions_user_id_idx   ON public.moment_reactions USING btree (user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER moments_updated_at
  BEFORE UPDATE ON public.moments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_invite_code
  BEFORE INSERT ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.generate_invite_code();

CREATE TRIGGER evict_push_token
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.evict_push_token_from_other_profiles();

-- Fires handle_new_user when a user signs up via Supabase Auth
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tagged_moments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_reactions  ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon can read profiles for public link pages"
  ON public.profiles FOR SELECT TO anon
  USING (friend_invite_token IS NOT NULL);

-- moments
CREATE POLICY "Users can create their own moments"
  ON public.moments FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own moments"
  ON public.moments FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete moments"
  ON public.moments FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      guest_uuid IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM collection_moments cm
        JOIN collections c ON c.id = cm.collection_id
        WHERE cm.moment_id = moments.id AND c.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Users can view moments"
  ON public.moments FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM collection_moments cm
      JOIN collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM collection_moments cm
      JOIN collection_members cmb ON cmb.collection_id = cm.collection_id
      WHERE cm.moment_id = moments.id AND cmb.user_id = (SELECT auth.uid())
    )
    OR (
      visibility = ANY (ARRAY['connections'::text, 'link'::text])
      AND EXISTS (
        SELECT 1 FROM tagged_moments
        WHERE tagged_moments.moment_id = moments.id
          AND tagged_moments.tagged_user_id = (SELECT auth.uid())
          AND tagged_moments.status <> 'hidden'::text
      )
    )
  );

CREATE POLICY "Anon can read moments in public collections or with share token"
  ON public.moments FOR SELECT TO anon
  USING (
    share_token IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM collection_moments cm
      JOIN collections c ON c.id = cm.collection_id
      WHERE cm.moment_id = moments.id AND c.is_public = true
    )
  );

-- collections
CREATE POLICY "Owners can insert collections"
  ON public.collections FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can update collections"
  ON public.collections FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Owners can delete collections"
  ON public.collections FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Can select collections"
  ON public.collections FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR is_public = true);

CREATE POLICY "Anon can read public collections"
  ON public.collections FOR SELECT TO anon
  USING (is_public = true);

-- collection_members
CREATE POLICY "Members can view collection membership"
  ON public.collection_members FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_members.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can join or be added to collections"
  ON public.collection_members FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_members.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can leave or be removed from collections"
  ON public.collection_members FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_members.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can update their own last_viewed_at"
  ON public.collection_members FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- collection_moments
CREATE POLICY "Can select collection_moments"
  ON public.collection_moments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_moments.collection_id
        AND (collections.user_id = (SELECT auth.uid()) OR collections.is_public = true)
    )
    OR EXISTS (
      SELECT 1 FROM collection_members
      WHERE collection_members.collection_id = collection_moments.collection_id
        AND collection_members.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Can insert collection_moments"
  ON public.collection_moments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_moments.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
    OR (
      added_by_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM collection_members
        WHERE collection_members.collection_id = collection_moments.collection_id
          AND collection_members.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Can delete collection_moments"
  ON public.collection_moments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_moments.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
    OR (
      added_by_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM collection_members
        WHERE collection_members.collection_id = collection_moments.collection_id
          AND collection_members.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Anon can read collection_moments in public collections"
  ON public.collection_moments FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_moments.collection_id AND is_public = true
    )
  );

-- collection_invites
CREATE POLICY "Invitees and inviters can view invites"
  ON public.collection_invites FOR SELECT
  USING (invitee_id = (SELECT auth.uid()) OR inviter_id = (SELECT auth.uid()));

CREATE POLICY "Owners can send invites"
  ON public.collection_invites FOR INSERT
  WITH CHECK (
    inviter_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = collection_invites.collection_id
        AND collections.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners or invitees can delete invites"
  ON public.collection_invites FOR DELETE
  USING (invitee_id = (SELECT auth.uid()) OR inviter_id = (SELECT auth.uid()));

-- friendships
CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (requester_id = (SELECT auth.uid()));

CREATE POLICY "Only addressee can accept friendship"
  ON public.friendships FOR UPDATE
  USING (addressee_id = (SELECT auth.uid()))
  WITH CHECK (addressee_id = (SELECT auth.uid()) AND status = 'accepted'::text);

CREATE POLICY "Either party can remove friendship"
  ON public.friendships FOR DELETE
  USING (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()));

CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()));

-- tagged_moments
CREATE POLICY "Taggers can insert tags on their own moments"
  ON public.tagged_moments FOR INSERT TO authenticated
  WITH CHECK (tagger_user_id = (SELECT auth.uid()) AND check_moment_owner(moment_id));

CREATE POLICY "Tagger can release; tagged user can accept or hide"
  ON public.tagged_moments FOR UPDATE
  USING (tagger_user_id = (SELECT auth.uid()) OR tagged_user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view tags involving them"
  ON public.tagged_moments FOR SELECT
  USING (tagger_user_id = (SELECT auth.uid()) OR tagged_user_id = (SELECT auth.uid()));

CREATE POLICY "Tagger can delete their tags"
  ON public.tagged_moments FOR DELETE
  USING (tagger_user_id = (SELECT auth.uid()));

-- moment_reactions
CREATE POLICY "Users can insert their own reactions"
  ON public.moment_reactions FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own reactions"
  ON public.moment_reactions FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view reactions"
  ON public.moment_reactions FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM moments
      WHERE moments.id = moment_reactions.moment_id
        AND moments.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('moment-photos', 'moment-photos', true, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for moment-photos bucket
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Anyone can read photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'moment-photos');

CREATE POLICY "Users can update their own photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
