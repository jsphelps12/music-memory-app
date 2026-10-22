-- Occasions P1.3: couple setup (docs/OCCASIONS.md, flow 1).
--
-- Everything that needs rules beyond plain column grants goes through a
-- function here, so the web page can't get it wrong:
--   * occasion_slug_available: is /for/{slug} free (format, reserved words,
--     taken)? Readable by signed-in hosts without seeing anyone's occasion.
--   * create_occasion_draft: the one way to create an occasion. Picks a free
--     slug (the requested one, else with the month and year, else numbered)
--     and links the /weddings reservation if it belongs to the caller.
--   * set_occasion_slug: change the link while still a draft.
--   * my_wedding_reservations: the caller's own reservations, to prefill
--     setup.
--   * activate_occasion: paid → collecting. Service role only: Stripe's
--     webhook calls it later; until then a staging-only edge function does.

CREATE OR REPLACE FUNCTION public.occasion_slug_reserved(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_slug = ANY (ARRAY[
    'admin', 'api', 'app', 'book', 'for', 'help', 'host', 'login', 'new',
    'privacy', 'settings', 'sign-in', 'signin', 'soundtracks', 'support',
    'terms', 'test', 'wedding', 'weddings'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.occasion_slug_valid(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_slug IS NOT NULL
    AND char_length(p_slug) BETWEEN 3 AND 80
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND NOT public.occasion_slug_reserved(p_slug);
$$;

-- Suggested songs are shown on every guest's phone, so their shape is a
-- table rule (it holds for the create function and direct host edits alike):
-- an Apple Music id, a title, an artist, and artwork only from Apple's CDN.
CREATE OR REPLACE FUNCTION public.occasion_songs_valid(p_songs jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_songs) = 'array'
    AND jsonb_array_length(p_songs) <= 6
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_songs) e
      WHERE jsonb_typeof(e) <> 'object'
         OR coalesce(e ->> 'appleMusicId', '') !~ '^[0-9]{1,15}$'
         OR char_length(coalesce(e ->> 'title', '')) NOT BETWEEN 1 AND 300
         OR char_length(coalesce(e ->> 'artist', '')) NOT BETWEEN 1 AND 300
         OR (e ? 'artworkUrl' AND e ->> 'artworkUrl' IS NOT NULL
             AND (e ->> 'artworkUrl') !~ '^https://is[0-9]+-ssl\.mzstatic\.com/')
    );
$$;

ALTER TABLE public.occasions
  DROP CONSTRAINT IF EXISTS occasions_suggested_songs_shape;
ALTER TABLE public.occasions
  ADD CONSTRAINT occasions_suggested_songs_shape CHECK (public.occasion_songs_valid(suggested_songs));

CREATE OR REPLACE FUNCTION public.occasion_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.occasion_slug_valid(p_slug)
    AND NOT EXISTS (SELECT 1 FROM public.occasions WHERE slug = p_slug);
$$;

REVOKE ALL ON FUNCTION public.occasion_slug_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.occasion_slug_available(text) TO authenticated;

-- The caller's reservations from /weddings, matched on their verified email,
-- that haven't become an occasion yet.
CREATE OR REPLACE FUNCTION public.my_wedding_reservations()
RETURNS TABLE (id uuid, couple_names text, wedding_date date, guest_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.couple_names, r.wedding_date, r.guest_count
  FROM public.wedding_reservations r
  WHERE lower(r.email) = lower((SELECT auth.jwt() ->> 'email'))
    AND (SELECT auth.jwt() ->> 'email') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.occasions o WHERE o.reservation_id = r.id)
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_wedding_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_wedding_reservations() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_occasion_draft(
  p_names text,
  p_event_date date,
  p_city text,
  p_time_zone text,
  p_guest_estimate integer,
  p_slug text,
  p_suggested_songs jsonb,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_base text := lower(btrim(p_slug));
  v_try text;
  v_reservation uuid;
  v_id uuid;
  n integer := 1;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_time_zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_time_zone) THEN
    RAISE EXCEPTION 'unknown time zone' USING ERRCODE = '22023';
  END IF;
  IF p_event_date < current_date - 1 OR p_event_date > current_date + interval '3 years' THEN
    RAISE EXCEPTION 'date out of range' USING ERRCODE = '22023';
  END IF;
  -- A host gets a few drafts, not unlimited.
  IF (SELECT count(*) FROM public.occasions WHERE host_user_id = v_uid AND status = 'draft') >= 5 THEN
    RAISE EXCEPTION 'too many drafts' USING ERRCODE = '54000';
  END IF;

  -- Only the caller's own reservation can be linked; anything else is ignored.
  IF p_reservation_id IS NOT NULL THEN
    SELECT r.id INTO v_reservation FROM public.my_wedding_reservations() r WHERE r.id = p_reservation_id;
  END IF;

  IF NOT public.occasion_slug_valid(v_base) THEN
    RAISE EXCEPTION 'invalid link' USING ERRCODE = '22023';
  END IF;

  -- The requested link, else with the month and year, else numbered.
  v_try := v_base;
  LOOP
    BEGIN
      INSERT INTO public.occasions (host_user_id, names, event_date, city, time_zone,
                                    guest_estimate, slug, suggested_songs, reservation_id)
      VALUES (v_uid, btrim(p_names), p_event_date, nullif(btrim(p_city), ''), p_time_zone,
              p_guest_estimate, v_try, coalesce(p_suggested_songs, '[]'::jsonb), v_reservation)
      RETURNING occasions.id INTO v_id;
      RETURN QUERY SELECT v_id, v_try;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      n := n + 1;
      IF n = 2 THEN
        v_try := left(v_base, 64) || '-' || lower(to_char(p_event_date, 'FMmonth-YYYY'));
      ELSIF n <= 20 THEN
        v_try := left(v_base, 64) || '-' || lower(to_char(p_event_date, 'FMmonth-YYYY')) || '-' || (n - 1);
      ELSE
        RAISE EXCEPTION 'no free link' USING ERRCODE = '23505';
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_occasion_draft(text, date, text, text, integer, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_occasion_draft(text, date, text, text, integer, text, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_occasion_slug(p_occasion_id uuid, p_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(btrim(p_slug));
BEGIN
  IF NOT public.occasion_slug_valid(v_slug) THEN
    RAISE EXCEPTION 'invalid link' USING ERRCODE = '22023';
  END IF;
  UPDATE public.occasions
     SET slug = v_slug
   WHERE id = p_occasion_id
     AND status = 'draft'
     AND (SELECT auth.uid()) IN (host_user_id, co_host_user_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not your draft' USING ERRCODE = '42501';
  END IF;
  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.set_occasion_slug(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_occasion_slug(uuid, text) TO authenticated;

-- Paid → collecting. Closes two weeks after the wedding, at the end of that
-- day in the wedding's own time zone. Idempotent: a repeat (a retried
-- webhook) changes nothing and returns the row.
CREATE OR REPLACE FUNCTION public.activate_occasion(p_occasion_id uuid, p_checkout_id text DEFAULT NULL)
RETURNS public.occasions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.occasions;
BEGIN
  UPDATE public.occasions
     SET status = 'collecting',
         paid_at = coalesce(paid_at, now()),
         stripe_checkout_id = coalesce(stripe_checkout_id, p_checkout_id),
         collect_closes_at = ((event_date + 15)::timestamp AT TIME ZONE time_zone)
   WHERE id = p_occasion_id AND status = 'draft'
   RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.occasions WHERE id = p_occasion_id;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_occasion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_occasion(uuid, text) TO service_role;
