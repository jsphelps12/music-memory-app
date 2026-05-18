-- ── Schema Audit Cleanup (2026-05-18) ────────────────────────────────────────
-- Applies after 20260517_security_fixes.sql.
--
-- 1. Fix mutable search_path on trigger functions
-- 2. Revoke anon EXECUTE on SECURITY DEFINER functions that require auth
-- 3. Drop 4 duplicate / redundant indexes
-- 4. Add 5 missing foreign key indexes
-- 5. Drop duplicate moments SELECT policy

-- ── 1. Fix mutable search_path on trigger functions ───────────────────────────

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ── 2. Revoke anon EXECUTE on functions that use auth.uid() internally ─────────
-- These are SECURITY DEFINER functions that read user-scoped data.
-- Unauthenticated callers would get empty results (auth.uid() = null) but
-- exposing them via /rest/v1/rpc/ to anon is still unnecessary surface area.

REVOKE ALL ON FUNCTION public.get_random_moment() FROM anon;
REVOKE ALL ON FUNCTION public.get_random_forgotten_moment(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_tagged_moment_data(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.evict_push_token_from_other_profiles() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

-- ── 3. Drop duplicate / redundant indexes ─────────────────────────────────────

-- Superseded by the partial index idx_moments_share_token
-- (WHERE share_token IS NOT NULL), which is smaller and faster
DROP INDEX IF EXISTS public.moments_share_token_idx;

-- Duplicates the UNIQUE constraint tagged_moments_moment_id_tagged_user_id_key
DROP INDEX IF EXISTS public.tagged_moments_moment_tagged_idx;

-- Duplicates the UNIQUE constraint tagged_moments_tag_token_key
DROP INDEX IF EXISTS public.tagged_moments_token_idx;

-- Duplicates the UNIQUE constraint collections_invite_code_key
DROP INDEX IF EXISTS public.collections_invite_code_idx;

-- ── 4. Missing foreign key indexes ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS collection_invites_invitee_id_idx
  ON public.collection_invites (invitee_id);

CREATE INDEX IF NOT EXISTS collection_invites_inviter_id_idx
  ON public.collection_invites (inviter_id);

CREATE INDEX IF NOT EXISTS collection_moments_added_by_user_id_idx
  ON public.collection_moments (added_by_user_id);

CREATE INDEX IF NOT EXISTS collections_guest_user_id_idx
  ON public.collections (guest_user_id);

CREATE INDEX IF NOT EXISTS moment_reactions_user_id_idx
  ON public.moment_reactions (user_id);

-- ── 5. Drop duplicate moments SELECT policy ───────────────────────────────────
-- "Collection owners can read member moments" and
-- "Collection owners can read moments in their collections" have identical SQL.
-- Keep the more descriptive name.

DROP POLICY IF EXISTS "Collection owners can read member moments" ON public.moments;
