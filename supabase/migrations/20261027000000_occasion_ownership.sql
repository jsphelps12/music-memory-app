-- Occasions: who owns a wedding, and getting rid of one (docs/OCCASIONS.md,
-- roles).
--
--   * Deleting: only through the occasion-host edge function, which removes
--     every photo under {occasion_id}/ in the private bucket before the row
--     goes. A direct DELETE would cascade the entries away and leave guests'
--     photos behind, so clients lose DELETE on occasions entirely.
--   * Co-host: the primary host invites their partner with a single-use link
--     (7 days). The token is only ever stored as a SHA-256 hash. The partner
--     signs in, sees which wedding it is, and accepts. The primary host can
--     remove them; they can leave.

-- 1. Deleting goes through the edge function --------------------------------

DROP POLICY IF EXISTS "Hosts delete their drafts" ON public.occasions;
REVOKE DELETE ON public.occasions FROM authenticated;

-- 2. Co-host invites -------------------------------------------------------

ALTER TABLE public.occasions
  ADD COLUMN IF NOT EXISTS cohost_invite_hash text CHECK (cohost_invite_hash IS NULL OR char_length(cohost_invite_hash) = 64),
  ADD COLUMN IF NOT EXISTS cohost_invite_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS occasions_cohost_invite_hash_idx
  ON public.occasions (cohost_invite_hash) WHERE cohost_invite_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.occasion_invite_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- A new invite link (replacing any earlier one). Primary host only, and only
-- while there's no co-host. Returns the token; only its hash is kept.
CREATE OR REPLACE FUNCTION public.create_cohost_invite(p_occasion_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Two v4 uuids: 244 random bits.
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
BEGIN
  UPDATE public.occasions
     SET cohost_invite_hash = public.occasion_invite_hash(v_token),
         cohost_invite_expires_at = now() + interval '7 days'
   WHERE id = p_occasion_id
     AND host_user_id = (SELECT auth.uid())
     AND co_host_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not yours, or already shared' USING ERRCODE = '42501';
  END IF;
  RETURN v_token;
END;
$$;

-- What an invite is for, so the partner can see whose wedding before joining.
-- Nothing for a used, expired or unknown token.
CREATE OR REPLACE FUNCTION public.peek_cohost_invite(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('names', o.names, 'eventDate', o.event_date, 'city', o.city,
                            'isHost', o.host_user_id = (SELECT auth.uid()))
    FROM public.occasions o
   WHERE p_token ~ '^[0-9a-f]{64}$'
     AND o.cohost_invite_hash = public.occasion_invite_hash(p_token)
     AND o.cohost_invite_expires_at > now()
     AND o.co_host_user_id IS NULL;
$$;

-- Join as co-host. Single use: the invite is cleared as it's accepted.
CREATE OR REPLACE FUNCTION public.accept_cohost_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.occasions
     SET co_host_user_id = (SELECT auth.uid()),
         cohost_invite_hash = NULL,
         cohost_invite_expires_at = NULL
   WHERE cohost_invite_hash = public.occasion_invite_hash(p_token)
     AND cohost_invite_expires_at > now()
     AND co_host_user_id IS NULL
     AND host_user_id <> (SELECT auth.uid())
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$$;

-- The primary host removes the co-host, or the co-host leaves. Also cancels
-- an outstanding invite.
CREATE OR REPLACE FUNCTION public.remove_cohost(p_occasion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.occasions
     SET co_host_user_id = NULL,
         cohost_invite_hash = NULL,
         cohost_invite_expires_at = NULL
   WHERE id = p_occasion_id
     AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not yours' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Who manages a wedding, for its hosts' dashboard: both emails, which one
-- the caller is, and whether an invite is waiting.
CREATE OR REPLACE FUNCTION public.occasion_hosts(p_occasion_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'hostEmail', h.email,
           'cohostEmail', c.email,
           'youAreHost', o.host_user_id = (SELECT auth.uid()),
           'invitePending', o.cohost_invite_hash IS NOT NULL AND o.cohost_invite_expires_at > now())
    FROM public.occasions o
    JOIN auth.users h ON h.id = o.host_user_id
    LEFT JOIN auth.users c ON c.id = o.co_host_user_id
   WHERE o.id = p_occasion_id
     AND (SELECT auth.uid()) IN (o.host_user_id, o.co_host_user_id);
$$;

REVOKE ALL ON FUNCTION public.occasion_invite_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_cohost_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.peek_cohost_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_cohost_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_cohost(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.occasion_hosts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cohost_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_cohost_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_cohost_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_cohost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.occasion_hosts(uuid) TO authenticated;

-- 3. What's kept when a wedding is deleted --------------------------------
-- Deleting removes the couple's and guests' content, but two facts outlive
-- it: whether it was paid (for refunds, disputes and the books) and its link
-- (so a printed table card's QR code never opens someone else's wedding).
-- A trigger records both for every delete: the edge function's, and
-- delete-account's cascade. Nothing personal is kept.

CREATE TABLE IF NOT EXISTS public.occasion_deletions (
  occasion_id uuid PRIMARY KEY,
  slug text NOT NULL,
  paid_at timestamptz,
  stripe_checkout_id text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS occasion_deletions_slug_idx ON public.occasion_deletions (slug, deleted_at);

ALTER TABLE public.occasion_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.occasion_deletions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.occasions_record_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.occasion_deletions (occasion_id, slug, paid_at, stripe_checkout_id)
  VALUES (OLD.id, OLD.slug, OLD.paid_at, OLD.stripe_checkout_id)
  ON CONFLICT (occasion_id) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.occasions_record_deletion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS occasions_record_deletion ON public.occasions;
CREATE TRIGGER occasions_record_deletion BEFORE DELETE ON public.occasions
  FOR EACH ROW EXECUTE FUNCTION public.occasions_record_deletion();

-- A deleted wedding's link stays retired for two years. Raised as a unique
-- violation, the same as a taken link, so create_occasion_draft moves on to
-- the dated form and set_occasion_slug says it's taken.
CREATE OR REPLACE FUNCTION public.occasion_slug_retired(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.occasion_deletions
                  WHERE slug = p_slug AND deleted_at > now() - interval '2 years');
$$;
REVOKE ALL ON FUNCTION public.occasion_slug_retired(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.occasions_slug_not_retired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.occasion_slug_retired(NEW.slug) THEN
    RAISE EXCEPTION 'link retired' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.occasions_slug_not_retired() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS occasions_slug_not_retired ON public.occasions;
CREATE TRIGGER occasions_slug_not_retired BEFORE INSERT OR UPDATE OF slug ON public.occasions
  FOR EACH ROW EXECUTE FUNCTION public.occasions_slug_not_retired();

CREATE OR REPLACE FUNCTION public.occasion_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.occasion_slug_valid(p_slug)
    AND NOT EXISTS (SELECT 1 FROM public.occasions WHERE slug = p_slug)
    AND NOT public.occasion_slug_retired(p_slug);
$$;
REVOKE ALL ON FUNCTION public.occasion_slug_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.occasion_slug_available(text) TO authenticated;

-- 4. Deleting a wedding with gallery-filled moments ------------------------
-- When the wedding itself is deleted, its gallery rows and entries both
-- cascade away. Releasing the entries a gallery photo filled (an UPDATE) then
-- fails the entries' foreign key, because the wedding is already gone, and
-- the whole delete (or delete-account) aborts. With no wedding there's
-- nothing to release: the entries are going too.
CREATE OR REPLACE FUNCTION public.release_gallery_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.occasions WHERE id = OLD.occasion_id) THEN
    UPDATE public.occasion_entries
       SET photo_source = NULL, gallery_photo_id = NULL
     WHERE gallery_photo_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_gallery_photo() FROM PUBLIC, anon, authenticated;
