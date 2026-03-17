-- 1. Add username + friend_invite_token + profile_visibility to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS friend_invite_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'friends_only';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles(lower(username)) WHERE username IS NOT NULL;

-- 2. Friendships table
CREATE TABLE IF NOT EXISTS public.friendships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending', -- pending | accepted | declined | blocked
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id, status);

-- 3. Tagged moments table
CREATE TABLE IF NOT EXISTS public.tagged_moments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id       uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  tagger_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tagged_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  released        boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pending', -- pending | accepted | hidden
  tag_token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(moment_id, tagged_user_id)
);
CREATE INDEX IF NOT EXISTS tagged_moments_tagged_user_idx ON tagged_moments(tagged_user_id, released, status);
CREATE INDEX IF NOT EXISTS tagged_moments_tagger_user_idx ON tagged_moments(tagger_user_id);
CREATE INDEX IF NOT EXISTS tagged_moments_token_idx ON tagged_moments(tag_token);

-- 4. RLS: friendships
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Either party can update friendship"
  ON public.friendships FOR UPDATE
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "Either party can remove friendship"
  ON public.friendships FOR DELETE
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- 5. RLS: tagged_moments
ALTER TABLE public.tagged_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tags involving them"
  ON public.tagged_moments FOR SELECT
  USING (tagger_user_id = auth.uid() OR tagged_user_id = auth.uid());
CREATE POLICY "Taggers can insert tags on their own moments"
  ON public.tagged_moments FOR INSERT
  WITH CHECK (
    tagger_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.moments WHERE id = moment_id AND user_id = auth.uid())
  );
CREATE POLICY "Tagger can release; tagged user can accept or hide"
  ON public.tagged_moments FOR UPDATE
  USING (tagger_user_id = auth.uid() OR tagged_user_id = auth.uid());
CREATE POLICY "Tagger can delete their tags"
  ON public.tagged_moments FOR DELETE USING (tagger_user_id = auth.uid());
